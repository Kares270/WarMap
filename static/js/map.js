// Global variables
var allMarkers = {};
var connectingFrom = null;
var tempLatLng;
var editingIconId = null;

// Initialize the map
var map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -1
});
var bounds = [[0, 0], [1717, 1770]];
var image = L.imageOverlay('/static/wojna_frakcji_cropped11.png', bounds).addTo(map);
map.fitBounds(bounds);

// Function to open the icon creation modal
map.on('dblclick', function(e) {
    tempLatLng = e.latlng;

    var iconMenu = document.getElementById('iconMenu');
    iconMenu.style.top = e.containerPoint.y + 'px';
    iconMenu.style.left = e.containerPoint.x + 'px';
    iconMenu.style.display = 'block';

    loadFactions('factionSelectCreate');
});

// Cancel icon creation
document.getElementById('cancelIcon').addEventListener('click', function() {
    document.getElementById('iconMenu').style.display = 'none';
});

// Create a new icon
document.getElementById('createIcon').addEventListener('click', function() {
    var iconType = document.getElementById('iconSelect').value;
    var iconColor = document.getElementById('colorSelect').value;
    var iconName = document.getElementById('iconName').value;
    var iconDescription = document.getElementById('iconDescription').value;
    var factionId = document.getElementById('factionSelectCreate').value;

    createColoredIcon(iconType, iconColor).then(function(coloredIcon) {
        var marker = L.marker([tempLatLng.lat, tempLatLng.lng], { icon: coloredIcon })
            .addTo(map)
            .bindPopup(`<b>${iconName}</b><br>${iconDescription}<br><i>Faction: ${factionId}</i>`);

        // POST request to add an icon with correct headers
        $.ajax({
            url: '/add_icon',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                x_position: tempLatLng.lng,
                y_position: tempLatLng.lat,
                icon_type: iconType,
                icon_color: iconColor,
                name: iconName,
                description: iconDescription,
                faction_id: factionId
            }),
            success: function(response) {
                marker._icon.setAttribute('data-id', response.id);
                allMarkers[response.id] = marker;

                marker.on('contextmenu', function(e) {
                    showContextMenu(marker, e, response.id);
                });

                marker.on('click', function(e) {
                    handleMarkerClick(e, response.id);
                });
            },
            error: function(error) {
                console.error('Failed to create icon', error);
            }
        });

        document.getElementById('iconMenu').style.display = 'none';  // Hide modal
    });
});

// Function to load factions into the dropdown
function loadFactions(dropdownId, selectedFactionId = null) {
    $.get('/get_factions', function(factions) {
        var factionSelect = document.getElementById(dropdownId);
        factionSelect.innerHTML = '';
        factions.forEach(function(faction) {
            var option = document.createElement('option');
            option.value = faction.id;
            option.text = faction.name;
            if (selectedFactionId && faction.id == selectedFactionId) {
                option.selected = true;  // Preselect the correct faction
            }
            factionSelect.appendChild(option);
        });
    });
}

// Function to show context menu on right-click
function showContextMenu(marker, event, iconId) {
    var contextMenu = document.createElement('div');
    contextMenu.classList.add('context-menu');
    contextMenu.style.position = 'absolute';
    contextMenu.style.top = event.originalEvent.pageY + 'px';
    contextMenu.style.left = event.originalEvent.pageX + 'px';
    contextMenu.style.backgroundColor = 'white';
    contextMenu.style.border = '1px solid #ccc';
    contextMenu.style.padding = '10px';
    contextMenu.style.zIndex = 1000;

    contextMenu.innerHTML = `
        <ul>
            <li id="edit-icon">Edit Icon</li>
            <li id="delete-icon">Delete Icon</li>
            <li id="connect-icon">Connect to</li>
        </ul>`;
    document.body.appendChild(contextMenu);

    // Edit Icon action
    document.getElementById('edit-icon').addEventListener('click', function() {
        openEditModal(iconId, event);
        document.body.removeChild(contextMenu);
    });

    // Delete Icon action
    document.getElementById('delete-icon').addEventListener('click', function() {
        deleteIconAndConnections(iconId, marker);
        document.body.removeChild(contextMenu);
    });

    // Connect Icon action
    document.getElementById('connect-icon').addEventListener('click', function() {
        connectingFrom = iconId;  // Store the first icon ID
        console.log("Selected icon to connect from:", connectingFrom);
        document.body.removeChild(contextMenu);
    });

    document.addEventListener('click', function() {
        if (document.body.contains(contextMenu)) {
            document.body.removeChild(contextMenu);
        }
    }, { once: true });
}

// Handle the click event for connecting two icons
function handleMarkerClick(e, targetIconId) {
    console.log("Clicked on icon with ID:", targetIconId);

    if (connectingFrom && targetIconId !== connectingFrom) {
        console.log("Creating connection from", connectingFrom, "to", targetIconId);
        
        // Create the connection in the backend with proper headers
        $.ajax({
            url: '/add_connection',
            method: 'POST',
            contentType: 'application/json',  // Specify the correct content type
            data: JSON.stringify({
                icon_from_id: connectingFrom,
                icon_to_id: targetIconId
            }),
            success: function(response) {
                var fromMarker = allMarkers[connectingFrom];
                var toMarker = allMarkers[targetIconId];
                drawConnection(fromMarker, toMarker);  // Draw the connection line
                console.log("Connection created successfully.");
                connectingFrom = null;  // Reset connection state
            },
            error: function() {
                console.error('Failed to create connection.');
            }
        });
    } else if (targetIconId === connectingFrom) {
        console.log("Cannot connect an icon to itself.");
        connectingFrom = null;  // Reset state
    }
}

// Function to delete an icon and its connections
function deleteIconAndConnections(iconId, marker) {
    $.ajax({
        url: `/delete_icon/${iconId}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                map.removeLayer(marker);
                deleteConnections(iconId);
            }
        },
        error: function() {
            console.error('Error deleting the icon.');
        }
    });
}

// Function to delete connections related to an icon
function deleteConnections(iconId) {
    map.eachLayer(function(layer) {
        if (layer instanceof L.Polyline) {
            var latLngs = layer.getLatLngs();
            if (latLngs.some(function(latLng) {
                return latLng.lat === allMarkers[iconId].getLatLng().lat && latLng.lng === allMarkers[iconId].getLatLng().lng;
            })) {
                map.removeLayer(layer);
            }
        }
    });
}

// Function to open the edit modal for the selected icon
function openEditModal(iconId, event) {
    editingIconId = iconId;  // Store the ID of the icon being edited

    $.get(`/get_icon/${iconId}`, function(iconData) {
        // Populate the form with the current icon data
        document.getElementById('editIconSelect').value = iconData.icon_type;
        document.getElementById('editColorSelect').value = iconData.icon_color;
        document.getElementById('editIconName').value = iconData.name;
        document.getElementById('editIconDescription').value = iconData.description;

        // Load factions and pre-select the correct faction for the icon
        loadFactions('factionSelectEdit', iconData.faction_id);

        var editIconMenu = document.getElementById('editIconMenu');
        editIconMenu.style.top = event.containerPoint.y + 'px';
        editIconMenu.style.left = event.containerPoint.x + 'px';
        editIconMenu.style.display = 'block';
    });
}

// Update the icon data
function updateIconData() {
    var iconType = document.getElementById('editIconSelect').value;
    var iconColor = document.getElementById('editColorSelect').value;
    var iconName = document.getElementById('editIconName').value;
    var iconDescription = document.getElementById('editIconDescription').value;
    var factionId = document.getElementById('factionSelectEdit').value;  // Get the selected faction ID

    $.ajax({
        url: `/update_icon/${editingIconId}`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            icon_type: iconType,
            icon_color: iconColor,
            name: iconName,
            description: iconDescription,
            faction_id: factionId  // Send the faction_id with the request
        }),
        success: function(response) {
            var marker = allMarkers[editingIconId];

            // Fetch the updated faction name and update the popup content
            $.get(`/get_faction_name/${factionId}`, function(factionData) {
                console.log(`Fetched faction name for faction_id ${factionId}:`, factionData);  // Add logging

                var factionName = factionData.name || 'No faction';  // Ensure fallback
                marker.setPopupContent(`<b>${iconName}</b><br>${iconDescription}<br><i>Faction: ${factionName}</i>`);

                // Force the popup to reopen with the updated content
                marker.closePopup();
                marker.openPopup();

                document.getElementById('editIconMenu').style.display = 'none';  // Hide the modal
            }).fail(function() {
                console.error('Failed to fetch the faction name.');
            });
        },
        error: function() {
            console.error('Failed to update the icon.');
        }
    });
}

// Attach event listeners for the "Update Icon" and "Cancel" buttons
document.getElementById('updateIcon').addEventListener('click', function() {
    updateIconData();  // Call update function
});

document.getElementById('cancelEditIcon').addEventListener('click', function() {
    document.getElementById('editIconMenu').style.display = 'none';  // Hide the modal
});

// Draw connection between two markers
function drawConnection(fromMarker, toMarker) {
    var latlngs = [fromMarker.getLatLng(), toMarker.getLatLng()];
    var polyline = L.polyline(latlngs, { color: 'white', weight: 2 }).addTo(map);

    polyline.on('contextmenu', function(e) {
        showConnectionContextMenu(polyline, e, fromMarker, toMarker);
    });
}

// Show context menu for connection
function showConnectionContextMenu(polyline, event, fromMarker, toMarker) {
    var contextMenu = document.createElement('div');
    contextMenu.classList.add('context-menu');
    contextMenu.style.position = 'absolute';
    contextMenu.style.top = event.originalEvent.pageY + 'px';
    contextMenu.style.left = event.originalEvent.pageX + 'px';
    contextMenu.style.backgroundColor = 'white';
    contextMenu.style.border = '1px solid #ccc';
    contextMenu.style.padding = '5px';
    contextMenu.style.zIndex = 1000;
    contextMenu.innerHTML = '<ul><li id="delete-connection">Delete Connection</li></ul>';
    document.body.appendChild(contextMenu);

    document.getElementById('delete-connection').addEventListener('click', function() {
        deleteLine(polyline, fromMarker, toMarker);
        document.body.removeChild(contextMenu);
    });

    document.addEventListener('click', function() {
        if (document.body.contains(contextMenu)) {
            document.body.removeChild(contextMenu);
        }
    }, { once: true });
}

// Delete connection (line) between two markers
function deleteLine(polyline, fromMarker, toMarker) {
    var fromId = fromMarker._icon.dataset.id;
    var toId = toMarker._icon.dataset.id;

    map.removeLayer(polyline);

    $.post('/delete_connection', {
        from_id: fromId,
        to_id: toId
    }, function(response) {
        if (response.success) {
            console.log('Connection deleted.');
        } else {
            console.error('Failed to delete connection.');
        }
    });
}

// Load and recolor SVG icons
function createColoredIcon(iconType, iconColor) {
    return new Promise(function(resolve) {
        var iconPath = `/static/images/${iconType}.svg`;
        fetch(iconPath)
            .then(response => response.text())
            .then(svgContent => {
                svgContent = svgContent.replace(/fill="[^"]*"/g, `fill="${iconColor}"`);
                var divIcon = L.divIcon({
                    html: svgContent,
                    className: 'custom-svg-icon',
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });
                resolve(divIcon);
            });
    });
}

// Load icons and connections on page load
function loadIcons() {
    $.get('/get_icons', function(icons) {
        var totalIcons = icons.length;
        var loadedIcons = 0;

        icons.forEach(function(icon) {
            createColoredIcon(icon.icon_type, icon.icon_color).then(function(coloredIcon) {
                // Use the faction_name from the server response directly
                var factionName = icon.faction_name || 'No faction';  // Fallback in case it's missing

                addMarkerToMap(icon, coloredIcon, factionName);  // Pass the faction name directly
                checkIfAllMarkersLoaded();  // Check if all markers are loaded
            });
        });

        // Helper function to check if all markers are loaded
        function checkIfAllMarkersLoaded() {
            loadedIcons++;
            if (loadedIcons === totalIcons) {
                // All markers are loaded, now load connections
                console.log("All markers loaded. Now loading connections...");
                loadConnections();  // Call loadConnections once all icons are loaded
            }
        }
    });
}

// Helper function to add marker to the map with bindPopup
function addMarkerToMap(icon, coloredIcon, factionName) {
    var marker = L.marker([icon.y_position, icon.x_position], { icon: coloredIcon })
        .addTo(map)
        .bindPopup(`<b>${icon.name}</b><br>${icon.description}<br><i>Faction: ${factionName}</i>`);

    allMarkers[icon.id] = marker;
    marker._icon.setAttribute('data-id', icon.id);

    marker.on('contextmenu', function(e) {
        showContextMenu(marker, e, icon.id);
    });

    // Attach click event to the marker for Connect To
    marker.on('click', function(e) {
        handleMarkerClick(e, icon.id);
    });
}

// Load connections from the database
function loadConnections() {
    $.get('/get_connections', function(connections) {
        console.log("Connections received from server:", connections);  // Log the connections received
        connections.forEach(function(connection) {
            var fromMarker = allMarkers[connection.icon_from_id];
            var toMarker = allMarkers[connection.icon_to_id];

            if (fromMarker && toMarker) {
                console.log(`Drawing connection from marker ${connection.icon_from_id} to marker ${connection.icon_to_id}`);
                drawConnection(fromMarker, toMarker);
            } else {
                console.error("Markers not found for connection:", connection);
            }
        });
    }).fail(function(error) {
        console.error("Failed to load connections from server:", error);
    });
}

// Initial call to load icons and connections
loadIcons();
