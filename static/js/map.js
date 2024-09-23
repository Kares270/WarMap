// Initialize the map
var map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -1
});

var bounds = [[0, 0], [1717, 1770]];  // Adjust these values to fit your image dimensions
var image = L.imageOverlay('/static/wojna_frakcji_cropped11.png', bounds).addTo(map);
map.fitBounds(bounds);

var tempLatLng;
var allMarkers = {};  // Store markers by ID for reference when drawing connections
var connectingFrom = null;  // Track the icon that the user is connecting from
var editingIconId = null;  // Store the icon ID for editing

// Function to open the icon creation modal
map.on('dblclick', function(e) {
    tempLatLng = e.latlng;  // Store the clicked position

    // Display the icon creation menu
    var iconMenu = document.getElementById('iconMenu');
    iconMenu.style.top = e.containerPoint.y + 'px';
    iconMenu.style.left = e.containerPoint.x + 'px';
    iconMenu.style.display = 'block';
});

// Function to populate the "Edit connect to" dropdown in the edit menu
function populateEditConnectOptions(iconId) {
    var editConnectTo = document.getElementById('editConnectTo');
    editConnectTo.innerHTML = '';  // Clear existing options

    // Fetch the existing connections for this icon
    $.get(`/get_connections_for_icon/${iconId}`, function(currentConnections) {
        // Populate the options for all markers
        Object.keys(allMarkers).forEach(function(id) {
            if (id != iconId) {  // Don't connect to itself
                var iconName = allMarkers[id].getPopup().getContent().split('<br>')[0].replace('<b>', '').replace('</b>', '');  // Extract the name from the popup content
                var option = document.createElement('option');
                option.value = id;
                option.text = iconName;  // Use the icon's name
                if (currentConnections.includes(parseInt(id))) {
                    option.selected = true;  // Pre-select existing connections
                }
                editConnectTo.appendChild(option);
            }
        });
    });
}

// Function to delete an icon and its connections
function deleteIconAndConnections(iconId, marker) {
    // Call the backend API to delete the icon and its connections
    $.ajax({
        url: `/delete_icon/${iconId}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                // Remove the marker (icon) from the map
                map.removeLayer(marker);

                // Remove all connections related to this icon from the map
                deleteConnections(iconId);
            } else {
                console.error('Failed to delete icon from server.');
            }
        },
        error: function() {
            console.error('Error deleting the icon.');
        }
    });
}

// Function to delete a connection (line) visually and from the database
function deleteLine(polyline, fromMarker, toMarker) {
    // Remove the polyline (visual line) from the map
    map.removeLayer(polyline);

    // Send an AJAX request to remove the connection from the database
    $.ajax({
        url: `/delete_connection`,  // Ensure this URL matches the backend route
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            from_id: fromMarker._icon.dataset.id,
            to_id: toMarker._icon.dataset.id
        }),
        success: function(response) {
            if (response.success) {
                console.log('Connection deleted successfully.');
            } else {
                console.error('Failed to delete connection from the server.');
            }
        },
        error: function() {
            console.error('Error occurred while trying to delete connection.');
        }
    });
}

// Function to create a custom context menu for right-clicking on markers
function showContextMenu(marker, event, iconId) {
    var contextMenu = document.createElement('div');
    contextMenu.classList.add('context-menu');
    contextMenu.style.position = 'absolute';
    contextMenu.style.top = event.containerPoint.y + 'px';
    contextMenu.style.left = event.containerPoint.x + 'px';
    contextMenu.style.backgroundColor = 'white';
    contextMenu.style.border = '1px solid #ccc';
    contextMenu.style.padding = '5px';
    contextMenu.style.zIndex = 1000;
    contextMenu.innerHTML = `<ul style="list-style-type:none; padding:0; margin:0;">
                                <li style="cursor:pointer;" id="edit-icon">Edit Icon</li>
                                <li style="cursor:pointer;" id="delete-icon">Delete Icon</li>
                                <li style="cursor:pointer;" id="connect-node">Connect Node</li>
                             </ul>`;

    document.body.appendChild(contextMenu);

    // Handle click on "Delete Icon"
    document.getElementById('delete-icon').addEventListener('click', function() {
        deleteIconAndConnections(iconId, marker);  // Delete icon and its connections
        if (document.body.contains(contextMenu)) {
            document.body.removeChild(contextMenu);  // Remove the context menu
        }
    });

    // Handle click on "Edit Icon"
    document.getElementById('edit-icon').addEventListener('click', function() {
        openEditModal(iconId, event);  // Open the edit modal for this icon
        if (document.body.contains(contextMenu)) {
            document.body.removeChild(contextMenu);  // Remove the context menu
        }
    });

    // Handle click on "Connect Node"
    document.getElementById('connect-node').addEventListener('click', function() {
        connectingFrom = iconId;  // Set the current icon as the source for connection
        alert('Now left-click on the icon you want to connect to.');
        if (document.body.contains(contextMenu)) {
            document.body.removeChild(contextMenu);  // Remove the context menu
        }
    });

    // Remove the context menu if the user clicks anywhere else
    document.addEventListener('click', function() {
        if (document.body.contains(contextMenu)) {
            document.body.removeChild(contextMenu);  // Remove the context menu
        }
    }, { once: true });
}

// Function to handle left-click events on markers for creating connections
function handleLeftClickForConnection(marker, iconId) {
    if (connectingFrom && connectingFrom !== iconId) {  // Ensure user clicked on a different icon
        // Create the connection between `connectingFrom` and the current `iconId`
        createConnection(connectingFrom, iconId);
        connectingFrom = null;  // Reset the connection state
    }
}

// Function to create a connection between two icons
function createConnection(fromId, toId) {
    var fromMarker = allMarkers[fromId];
    var toMarker = allMarkers[toId];

    if (fromMarker && toMarker) {
        drawConnection(fromMarker, toMarker);  // Draw the connection visually

        // Store the connection in the database
        $.ajax({
            url: '/add_connection',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                from_id: fromId,
                to_id: toId
            }),
            success: function(response) {
                if (response.success) {
                    console.log('Connection successfully created between nodes.');
                }
            },
            error: function() {
                console.log('Failed to create the connection.');
            }
        });
    }
}

// Handle creating the icon
// Function to handle creating the icon
document.getElementById('createIcon').addEventListener('click', function() {
    var iconType = document.getElementById('iconSelect').value;
    var iconColor = document.getElementById('colorSelect').value;
    var iconName = document.getElementById('iconName').value;
    var iconDescription = document.getElementById('iconDescription').value;

    // Use the createColoredIcon function to load and recolor the SVG
    createColoredIcon(iconType, iconColor).then(function(coloredIcon) {
        // Add the custom icon to the map
        var marker = L.marker([tempLatLng.lat, tempLatLng.lng], { icon: coloredIcon })
            .addTo(map)
            .bindPopup(`<b>${iconName}</b><br>${iconDescription}`);

        // Send the icon data to the backend to store in the database
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
                description: iconDescription
            }),
            success: function(response) {
                if (response.success) {
                    var iconId = response.id;  // Use the ID returned from the backend
                    marker._icon.dataset.id = iconId;  // Attach the new ID to the marker element
                    allMarkers[iconId] = marker;  // Store the new marker by its ID

                    // Correctly pass 'iconId' instead of 'response.id' here:
                    marker.on('contextmenu', function(e) {
                        showContextMenu(marker, e, iconId);  // Use the 'iconId' instead of 'response.id'
                    });

                    // Handle left-click to connect nodes
                    marker.on('click', function() {
                        handleLeftClickForConnection(marker, iconId);  // Use 'iconId' for connections
                    });

                    // Hide the icon creation menu after creation
                    document.getElementById('iconMenu').style.display = 'none';  // Close the icon creation menu
                }
            },
            error: function() {
                console.error('Failed to add icon.');
            }
        });
    });
});

// Cancel icon creation
document.getElementById('cancelIcon').addEventListener('click', function() {
    document.getElementById('iconMenu').style.display = 'none';  // Close the create icon modal
});

// Function to draw a line between two markers
function drawConnection(fromMarker, toMarker) {
    var latlngs = [
        [fromMarker.getLatLng().lat, fromMarker.getLatLng().lng],
        [toMarker.getLatLng().lat, toMarker.getLatLng().lng]
    ];
    var polyline = L.polyline(latlngs, { color: 'white' }).addTo(map);

    // Add right-click (context menu) event listener to the line
    polyline.on('contextmenu', function(e) {
        showConnectionContextMenu(polyline, e, fromMarker, toMarker);
    });
}
// Show context menu for connection (line)
function showConnectionContextMenu(polyline, event, fromMarker, toMarker) {
    var contextMenu = document.createElement('div');
    contextMenu.classList.add('context-menu');
    contextMenu.style.position = 'absolute';
    contextMenu.style.top = event.containerPoint.y + 'px';
    contextMenu.style.left = event.containerPoint.x + 'px';
    contextMenu.style.backgroundColor = 'white';
    contextMenu.style.border = '1px solid #ccc';
    contextMenu.style.padding = '5px';
    contextMenu.style.zIndex = 1000;
    contextMenu.innerHTML = `<ul style="list-style-type:none; padding:0; margin:0;">
                                <li style="cursor:pointer;" id="delete-connection">Delete Connection</li>
                             </ul>`;

    document.body.appendChild(contextMenu);

    // Handle the "Delete Connection" action
    document.getElementById('delete-connection').addEventListener('click', function() {
        deleteLine(polyline, fromMarker, toMarker);  // Call the delete connection function

        // Remove the context menu after deletion
        if (document.body.contains(contextMenu)) {
            document.body.removeChild(contextMenu);  // Remove the context menu
        }
    });

    // Remove the context menu if the user clicks anywhere else
    document.addEventListener('click', function() {
        if (document.body.contains(contextMenu)) {
            document.body.removeChild(contextMenu);  // Remove the context menu
        }
    }, { once: true });
}
// Fetch existing icons and connections from the server and add them to the map
$.get('/get_icons', function(icons) {
    let iconsLoaded = 0;
    const totalIcons = icons.length;

    icons.forEach(function(icon) {
        // Use the createColoredIcon function to load and recolor the stored icons
        createColoredIcon(icon.icon_type, icon.icon_color).then(function(coloredIcon) {
            var marker = L.marker([icon.y_position, icon.x_position], { icon: coloredIcon })
                .addTo(map)
                .bindPopup(`<b>${icon.name}</b><br>${icon.description}`);

            allMarkers[icon.id] = marker;  // Store marker by ID for later reference

            // Attach right-click context menu to the marker
            marker.on('contextmenu', function(e) {
                showContextMenu(marker, e, icon.id);  // Pass the marker and event to the context menu
            });

            // Attach left-click for connection handling
            marker.on('click', function() {
                handleLeftClickForConnection(marker, icon.id);  // Handle left-click for connection
            });

            // Check if all icons are loaded before drawing connections
            iconsLoaded++;
            if (iconsLoaded === totalIcons) {
                loadConnections();  // Load connections after all icons are added to the map
            }
        });
    });
});
// Function to open the edit modal for the selected icon
function openEditModal(iconId, event) {
    editingIconId = iconId;

    // Fetch the current icon data to populate the form
    $.get(`/get_icon/${iconId}`, function(iconData) {
        // Populate the edit form fields with the current icon data
        document.getElementById('editIconSelect').value = iconData.icon_type;
        document.getElementById('editColorSelect').value = iconData.icon_color;
        document.getElementById('editIconName').value = iconData.name;
        document.getElementById('editIconDescription').value = iconData.description;

        // Populate the "Connect to" options in the edit modal
        populateEditConnectOptions(iconId);  // Fetch and populate connection options

        // Position the edit modal near the clicked icon
        var editIconMenu = document.getElementById('editIconMenu');
        editIconMenu.style.top = event.containerPoint.y + 'px';
        editIconMenu.style.left = event.containerPoint.x + 'px';
        editIconMenu.style.display = 'block';  // Show the edit modal
    });

    // Event listener for updating the icon when the user clicks "Update"
    document.getElementById('updateIcon').addEventListener('click', function() {
        updateIconData();  // Call the function to update the icon
    });

    // Event listener for canceling the edit (hide the modal)
    document.getElementById('cancelEditIcon').addEventListener('click', function() {
        document.getElementById('editIconMenu').style.display = 'none';  // Hide the modal on cancel
    });
}

// Function to load and draw all connections
function loadConnections() {
    $.get('/get_connections', function(connections) {
        connections.forEach(function(connection) {
            var fromMarker = allMarkers[connection.from_id];
            var toMarker = allMarkers[connection.to_id];

            if (fromMarker && toMarker) {
                drawConnection(fromMarker, toMarker);
            }
        });
    });
}
// Function to load and recolor SVG, and enforce size constraints for icons
function createColoredIcon(iconType, color) {
    var svgIconPath = `/static/images/${iconType}.svg`;

    return new Promise(function(resolve) {
        // Fetch the raw SVG content
        fetch(svgIconPath)
            .then(response => response.text())
            .then(svgContent => {
                // Modify the fill attribute in the SVG content
                var coloredSvg = svgContent
                    .replace(/fill="[^"]*"/g, `fill="${color}"`)  // Update the fill color in the SVG
                    .replace(/<svg /, `<svg width="40" height="40" `);  // Set width and height

                // Create a Leaflet divIcon with the updated SVG content
                var divIcon = L.divIcon({
                    html: coloredSvg,  // Use the modified SVG as the HTML content of the icon
                    className: 'custom-svg-icon',  // Apply CSS class for any additional styling
                    iconSize: [40, 40],  // Set the size of the icon
                    iconAnchor: [20, 20]  // Center the icon on the point
                });

                resolve(divIcon);  // Resolve the promise with the created icon
            })
            .catch(err => console.error('Failed to load or modify the SVG:', err));  // Error handling
    });
}
