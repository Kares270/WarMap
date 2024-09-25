function openTab(tabName) {
    // Hide all tab contents
    var tabs = document.getElementsByClassName('tab-content');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].style.display = 'none';
    }

    // Show the selected tab content
    document.getElementById(tabName).style.display = 'block';
}

// Open the Map tab by default when the page loads
window.onload = function() {
    openTab('map-tab');
};
