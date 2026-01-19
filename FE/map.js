// 1. Initialize Map
var map = L.map('map', { 
    zoomControl: false,
    minZoom: 10 
}).setView([9.916, 76.945], 13);

// Set background color of the map container
document.getElementById('map').style.background = "#e3eaef";

L.control.zoom({ position: 'bottomright' }).addTo(map);

// 2. Basemap (OSM) - Added first so it's at the bottom
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, 
    attribution: '© OpenStreetMap'
}).addTo(map);

var geoServerUrl = "http://localhost:8080/geoserver/gramagis/wms";
var layers = {};
var maskLayer; 

// 3. Define all layers
const allLayerNames = [
    'Banks', 'Colleges', 'Fire Stations', 'Government Offices', 'Hospitals', 
    'Hotels', 'Petrol Pumps', 'Police Stations', 'Post Offices', 'Restaurants', 
    'Schools', 'Toilets', 'Roads', 'Boundaries', 'Ward Boundary'
];

allLayerNames.forEach(name => {
    let id = name.toLowerCase().replace(/\s+/g, '_');
    layers[id] = L.tileLayer.wms(geoServerUrl, {
        layers: `gramagis:${name}`,
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        zIndex: 1000 // Higher than the mask (900) so icons stay visible
    });
});

// 4. THE MASKING LOGIC (Enhanced for MultiPolygons)
var wfsUrl = "http://localhost:8080/geoserver/gramagis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gramagis:Ward Boundary&outputFormat=application/json";

fetch(wfsUrl)
    .then(res => res.json())
    .then(data => {
        // Define the "World" (The paper)
        var world = [[90, -180], [90, 180], [-90, 180], [-90, -180]];

        // Helper to flip [lng, lat] to [lat, lng] for any depth
        function flip(coords) {
            return coords.map(c => Array.isArray(c[0]) ? flip(c) : [c[1], c[0]]);
        }

        var geometry = data.features[0].geometry;
        var hole;

        if (geometry.type === "MultiPolygon") {
            // Take the first polygon of the multipolygon
            hole = flip(geometry.coordinates[0][0]);
        } else {
            // Standard Polygon
            hole = flip(geometry.coordinates[0]);
        }

        // CREATE THE MASK: [World Rectangle, The Hole]
        maskLayer = L.polygon([world, hole], {
            color: 'none',
            fillColor: '#e3eaef', 
            fillOpacity: 1,
            zIndex: 900,         // Ensure it sits above OSM
            interactive: false
        }).addTo(map);

        // Force layer order
        osm.bringToBack(); 

        // Center on the hole
        var bounds = L.geoJSON(data).getBounds();
        map.fitBounds(bounds);
        
        console.log("Mask applied successfully.");
    })
    .catch(err => console.error("Data Load Error:", err));


// 5. Toggle Function
function toggleLayer(layerID, checkbox) {
    if (layerID === 'basemap') {
        if (checkbox.checked) {
            if (maskLayer) map.removeLayer(maskLayer);
        } else {
            if (maskLayer) maskLayer.addTo(map);
        }
        return;
    }

    var selectedLayer = layers[layerID];
    if (selectedLayer) {
        if (checkbox.checked) {
            map.addLayer(selectedLayer);
            selectedLayer.bringToFront(); // Ensure data layers stay above the mask
        } else {
            map.removeLayer(selectedLayer);
        }
    }
}

// 6. Identify Feature logic
map.on('click', function (e) {
    let activeLayer = Object.values(layers).find(l => map.hasLayer(l));
    if (!activeLayer) return;

    var url = getFeatureInfoUrl(e.latlng, activeLayer);
    fetch(url).then(res => res.json()).then(data => {
        if (data.features.length > 0) {
            let props = data.features[0].properties;
            let content = "<h3>Details</h3><ul>";
            for (let key in props) { content += `<li><b>${key}:</b> ${props[key]}</li>`; }
            content += "</ul>";
            L.popup().setLatLng(e.latlng).setContent(content).openOn(map);
        }
    });
});

function getFeatureInfoUrl(latlng, layer) {
    var point = map.latLngToContainerPoint(latlng, map.getZoom()),
        size = map.getSize(),
        params = {
            request: 'GetFeatureInfo', service: 'WMS', srs: 'EPSG:4326',
            version: '1.1.1', format: 'image/png',
            bbox: map.getBounds().toBBoxString(),
            height: size.y, width: size.x,
            layers: layer.wmsParams.layers,
            query_layers: layer.wmsParams.layers,
            info_format: 'application/json',
            x: Math.round(point.x), y: Math.round(point.y)
        };
    return geoServerUrl + L.Util.getParamString(params, geoServerUrl, true);
}