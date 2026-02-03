// js/queryLogic.js

window.layerMapping = {
    "bank": "banks",
    "boundary": "boundaries",
    "college": "colleges",
    "fire": "fire_stations",
    "office": "government_offices",
    "hospital": "hospitals",
    "hotel": "hotels",
    "petrol": "petrol_pumps",
    "police": "police_stations",
    "post": "post_offices",
    "restaurant": "restaurants",
    "road": "roads",
    "school": "schools",
    "toilet": "toilets",
    "ward": "ward_boundary"
};

window.executeSmartQuery = async function(layers) {
    const inputField = document.getElementById('userInput');
    const input = inputField.value.toLowerCase();
    const originalPlaceholder = inputField.placeholder;
    let targetLayerKey = null;

    // 1. Identify target layer
    for (let keyword in layerMapping) {
        if (input.includes(keyword)) {
            targetLayerKey = layerMapping[keyword];
            break; 
        }
    }

    if (!targetLayerKey) {
        showNoResultsFeedback(inputField, "Try: Schools, Roads, Hotels...");
        return;
    }
    // Locate the year (4 consecutive digits)
    let yearMatch = input.match(/\d{4}/); 

    if (yearMatch) {
    let year = yearMatch[0];
    
    // Check for "after", "newer", "post"
    if (input.includes("after") || input.includes("newer")) {
        filterParts.push(`date_established >= '${year}-01-01'`);
    } 
    // Check for "before", "older", "pre"
    else if (input.includes("before") || input.includes("older")) {
        filterParts.push(`date_established <= '${year}-12-31'`);
    } 
    // Exact year search (covers the whole 12 months)
    else {
        filterParts.push(`date_established >= '${year}-01-01' AND date_established <= '${year}-12-31'`);
        }
    }
    
    // 2. Logic for CQL Filtering (General status/ward filters)
    let filterParts = [];
    if (input.includes("damaged") || input.includes("repair")) {
        filterParts.push("status = 'damaged'");
    }
    let wardMatch = input.match(/ward\s*(\d+)/);
    if (wardMatch) {
        filterParts.push(`ward_no = ${wardMatch[1]}`);
    }
    const finalCQL = filterParts.join(" AND ");

    // 3. Reset all WMS layers and apply general filter
    Object.keys(layers).forEach(key => {
        if (layers[key].setParams && key !== 'world_map' && key !== 'panchayat_basemap') {
            layers[key].setParams({ CQL_FILTER: null });
        }
    });

    if (layers[targetLayerKey]) {
        layers[targetLayerKey].setParams({ CQL_FILTER: finalCQL || null });
        if (!map.hasLayer(layers[targetLayerKey])) {
            map.addLayer(layers[targetLayerKey]);
            const checkbox = document.getElementById(`check-${targetLayerKey}`);
            if (checkbox) checkbox.checked = true;
        }
    }

    // 4. WFS DEEP SEARCH: Specific Institution or Ward Name
    // Maps the targetLayerKey back to GeoServer proper Name for the WFS request
    const geoServerName = targetLayerKey.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    
    const wfsUrl = `http://localhost:8080/geoserver/gramagis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gramagis:${geoServerName}&outputFormat=application/json&CQL_FILTER=name ILIKE '%${input}%' OR ward_name ILIKE '%${input}%'`;

    try {
        const response = await fetch(wfsUrl);
        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            const props = feature.properties;
            const geometry = feature.geometry;

            // Zoom Logic
            if (geometry.type === "Point") {
                map.setView([geometry.coordinates[1], geometry.coordinates[0]], 17);
            } else {
                const geoLayer = L.geoJSON(feature);
                map.fitBounds(geoLayer.getBounds());
            }

            // Display Info Panel
            displayInfoOnRight(props);
            
            // Highlight effect
            const highlight = L.geoJSON(feature, { color: 'yellow', weight: 5 }).addTo(map);
            setTimeout(() => map.removeLayer(highlight), 3000);
        } else if (filterParts.length === 0) {
            // Only show "No results" if it wasn't a general category filter (like "show schools")
            showNoResultsFeedback(inputField, originalPlaceholder);
        }
    } catch (err) {
        console.error("WFS Search Error:", err);
    }
};

function displayInfoOnRight(props) {
    const panel = document.getElementById('info-panel');
    const title = document.getElementById('info-title');
    const content = document.getElementById('info-content');

    panel.style.display = 'block';
    title.innerText = props.name || props.Name || "Details";
    
    let html = "<ul>";
    for (let key in props) {
        if (!['geom', 'id', 'gid', 'objectid'].includes(key.toLowerCase())) {
            let val = props[key];
            let displayVal = (val === null || val === undefined || val === "") 
                             ? "<i style='color: #999;'>Attribute not found</i>" 
                             : val;
            let cleanKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            html += `<li><b>${cleanKey}:</b> ${displayVal}</li>`;
        }
    }
    html += "</ul>";
    content.innerHTML = html;
}

function showNoResultsFeedback(inputField, originalText) {
    inputField.value = "";
    inputField.placeholder = "No results found!";
    inputField.classList.add('error-placeholder'); 
    setTimeout(() => {
        inputField.placeholder = originalText;
        inputField.classList.remove('error-placeholder');
    }, 3000);
}

function closeInfoPanel() {
    document.getElementById('info-panel').style.display = 'none';
}