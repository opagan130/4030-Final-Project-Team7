
const sequenceSelect = document.getElementById("sequence");
const trackSearch = document.getElementById("trackSearch");
const trackOptions = document.getElementById("trackOptions");
const selectedTracksDiv = document.getElementById("selectedTracks");

const startFrame = document.getElementById("startFrame");
const endFrame = document.getElementById("endFrame");
const startSlider = document.getElementById("startSlider");
const endSlider = document.getElementById("endSlider");
const frameRangeLabel = document.getElementById("frameRangeLabel");
const updateBtn = document.getElementById("updateBtn");

let availableTracks = [];
let selectedTracks = [];

let frameUpdateTimer;
let graphRequestNumber = 0;

function scheduleGraphUpdate() {
    clearTimeout(frameUpdateTimer);

    frameUpdateTimer = setTimeout(() => {
        updateGraph();
    }, 150);
}

async function getJSON(url) {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Request failed");
    }

    return data;
}

// Load available video sequences
async function loadSequences() {
    const sequences = await getJSON("/api/sequences");

    sequenceSelect.innerHTML = "";

    sequences.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        sequenceSelect.appendChild(option);
    });

    if (sequences.length > 0) {
        await loadTracks();
    }
}

// Load Track IDs for the selected sequence
async function loadTracks() {
    const sequence = sequenceSelect.value;

    const data = await getJSON(
        "/api/tracks?sequence=" + encodeURIComponent(sequence)
    );

    availableTracks = data.tracks;

    // Start with the first three tracks selected
    selectedTracks = availableTracks.slice(0, 3);

    startFrame.value = data.min_frame;
    endFrame.value = data.max_frame;

    startFrame.min = data.min_frame;
    startFrame.max = data.max_frame;
    endFrame.min = data.min_frame;
    endFrame.max = data.max_frame;

    //slider frame 
    startSlider.min = data.min_frame;
    startSlider.max = data.max_frame;
    startSlider.value = data.min_frame;

    endSlider.min = data.min_frame;
    endSlider.max = data.max_frame;
    endSlider.value = data.max_frame;

    frameRangeLabel.textContent =
        `Frames: ${data.min_frame} - ${data.max_frame}`;

    trackSearch.value = "";

    renderSelectedTracks();
    renderTrackOptions();

    await updateGraph();
}

// Display matching Track IDs
function renderTrackOptions() {
    const search = trackSearch.value.trim();

    trackOptions.innerHTML = "";

    const matches = availableTracks.filter(id =>
        String(id).includes(search)
    );

    matches.forEach(id => {
        const option = document.createElement("div");

        option.className = "track-option";
        option.textContent = "Track " + id;

        if (selectedTracks.includes(id)) {
            option.classList.add("selected");
        }

        option.addEventListener("click", () => {
            if (selectedTracks.includes(id)) {
                selectedTracks = selectedTracks.filter(
                    track => track !== id
                );
            } else {
                selectedTracks.push(id);
            }

            renderSelectedTracks();
            renderTrackOptions();
        });

        trackOptions.appendChild(option);
    });
}

// Display selected tracks as removable tags
function renderSelectedTracks() {
    selectedTracksDiv.innerHTML = "";

    selectedTracks.forEach(id => {
        const tag = document.createElement("span");

        tag.className = "track-tag";
        tag.textContent = "Track " + id + " ×";
        tag.title = "Click to remove Track " + id;

        tag.addEventListener("click", () => {
            selectedTracks = selectedTracks.filter(
                track => track !== id
            );

            renderSelectedTracks();
            renderTrackOptions();
        });

        selectedTracksDiv.appendChild(tag);
    });
}

// Search for Track IDs
trackSearch.addEventListener("input", () => {
    renderTrackOptions();
    trackOptions.style.display = "block";
});

// Open dropdown when search box is clicked
trackSearch.addEventListener("focus", () => {
    renderTrackOptions();
    trackOptions.style.display = "block";
});

// Close dropdown when clicking outside
document.addEventListener("click", event => {
    if (!event.target.closest(".track-filter")) {
        trackOptions.style.display = "none";
    }
});


async function showTrackDetails(trackId) {
    const sequence = sequenceSelect.value;

    const params = new URLSearchParams({
        sequence: sequence,
        track_id: trackId
    });

    const detailsDiv = document.getElementById("trackDetails");

    detailsDiv.innerHTML = "<p>Loading track details...</p>";

    try {
        const data = await getJSON(
            "/api/track-details?" + params.toString()
        );

        detailsDiv.innerHTML = `
            <h3>Selected Track Details</h3>

            <div class="track-stats">
                <div class="track-stat">
                    <span>Track ID</span>
                    <strong>${data.track_id}</strong>
                </div>

                <div class="track-stat">
                    <span>Frame Range</span>
                    <strong>
                        ${data.first_frame} - ${data.last_frame}
                    </strong>
                </div>

                <div class="track-stat">
                    <span>Observations</span>
                    <strong>${data.observations}</strong>
                </div>

                <div class="track-stat">
                    <span>Total Movement</span>
                    <strong>${data.total_distance} px</strong>
                </div>
            </div>
        `;

    } catch (error) {
        detailsDiv.textContent =
            "Could not load track details: " + error.message;
    }
}


// Update the trajectory graph
async function updateGraph() {
    const requestNumber = ++graphRequestNumber;
    document.getElementById("trackDetails").innerHTML = `
    <h3>Selected Track Details</h3>
    <p>Click a colored trajectory to view its details.</p>`;
    const params = new URLSearchParams({
        sequence: sequenceSelect.value,
        tracks: selectedTracks.join(","),
        start: startFrame.value,
        end: endFrame.value
    });

    updateBtn.disabled = true;
    updateBtn.textContent = "Loading...";

    try {
        const figure = await getJSON(
            "/api/trajectory?" + params.toString()
        );
        if (requestNumber !== graphRequestNumber) {
            return;
        }

        await Plotly.react(
            "trajectoryPlot",
            figure.data,
            figure.layout,
            {
                responsive: true,
                displaylogo: false
            }
        );
        const plot = document.getElementById("trajectoryPlot");

        // Remove the previous listener when updating the graph
        plot.removeAllListeners("plotly_click");

        plot.on("plotly_click", function(event) {
            const trace = event.points[0].data;

            // Only respond to highlighted tracks
            if (!trace.name.startsWith("Track ")) {
               return;
            }

            const trackId = parseInt(
                trace.name.replace("Track ", "")
            );

            showTrackDetails(trackId);
        });

            } catch (error) {
        if (requestNumber === graphRequestNumber) {
            alert("Could not update graph: " + error.message);
        }

    } finally {
        if (requestNumber === graphRequestNumber) {
            updateBtn.disabled = false;
            updateBtn.textContent = "Update Graph";
        }
    }
}


function updateFrameLabel() {
    frameRangeLabel.textContent =
        `Frames: ${startFrame.value} - ${endFrame.value}`;
}

// When the start slider moves
startSlider.addEventListener("input", () => {
    let value = Number(startSlider.value);

    if (value > Number(endSlider.value)) {
        value = Number(endSlider.value);
        startSlider.value = value;
    }

    startFrame.value = value;
    updateFrameLabel();
    scheduleGraphUpdate();
});

// When the end slider moves
endSlider.addEventListener("input", () => {
    let value = Number(endSlider.value);

    if (value < Number(startSlider.value)) {
        value = Number(startSlider.value);
        endSlider.value = value;
    }

    endFrame.value = value;
    updateFrameLabel();
    scheduleGraphUpdate();
});


// When someone types a start frame
startFrame.addEventListener("change", () => {
    const min = Number(startSlider.min);
    const max = Number(endFrame.value);

    const value = Math.max(
        min,
        Math.min(Number(startFrame.value), max)
    );

    startFrame.value = value;
    startSlider.value = value;
    updateFrameLabel();
    scheduleGraphUpdate();
});

// When someone types an end frame
endFrame.addEventListener("change", () => {
    const min = Number(startFrame.value);
    const max = Number(endSlider.max);

    const value = Math.max(
        min,
        Math.min(Number(endFrame.value), max)
    );

    endFrame.value = value;
    endSlider.value = value;
    updateFrameLabel();
    scheduleGraphUpdate();
});


// Update when the sequence changes
sequenceSelect.addEventListener("change", loadTracks);

// Update when the button is clicked
updateBtn.addEventListener("click", updateGraph);

// Load dashboard
loadSequences().catch(error => {
    alert("Could not load dashboard: " + error.message);
});
