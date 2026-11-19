
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


let currentData = [];

async function loadCSV(sequence) {
    currentData = await d3.csv(
        "GT/" + encodeURIComponent(sequence),
        d3.autoType
    );

    return currentData;
}


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
    const sequences = await getJSON("GT/sequences.json");

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

    const data = await loadCSV(sequence);

    availableTracks = [...new Set(
        data.map(d => Number(d.track_id))
            .filter(Number.isFinite)
    )].sort((a, b) => a - b);

    selectedTracks = availableTracks.slice(0, 3);

    const minFrame = d3.min(data, d => Number(d.frame_t));
    const maxFrame = d3.max(data, d => Number(d.frame_t));

    startFrame.value = minFrame;
    endFrame.value = maxFrame;

    startFrame.min = minFrame;
    startFrame.max = maxFrame;
    endFrame.min = minFrame;
    endFrame.max = maxFrame;

    startSlider.min = minFrame;
    startSlider.max = maxFrame;
    startSlider.value = minFrame;

    endSlider.min = minFrame;
    endSlider.max = maxFrame;
    endSlider.value = maxFrame;

    frameRangeLabel.textContent =
        `Frames: ${minFrame} - ${maxFrame}`;

    trackSearch.value = "";

    renderSelectedTracks();
    renderTrackOptions();

    await updateGraph();
}

function validMovement(d) {
    return (
        (d.HAS_FUTURE === true ||
         String(d.HAS_FUTURE).toLowerCase() === "true" ||
         d.HAS_FUTURE === 1) &&
        d.FUTURE_STATUS === "ok" &&
        d.target_spot_id !== null &&
        d.target_spot_id !== "" &&
        Number(d.target_spot_id) !== -1 &&
        [
            d.position_x_t,
            d.position_y_t,
            d.position_x_t_plus_1,
            d.position_y_t_plus_1
        ].every(value =>
            value !== null &&
            value !== "" &&
            Number.isFinite(Number(value))
        )
    );
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



function showTrackDetails(trackId) {
    const detailsDiv = document.getElementById("trackDetails");

    // Find all observations for this Track ID
    const track = currentData.filter(d =>
        Number(d.track_id) === trackId
    );

    if (track.length === 0) {
        detailsDiv.textContent = "Track not found.";
        return;
    }

    // Calculate frame range
    const firstFrame = d3.min(track, d => Number(d.frame_t));
    const lastFrame = d3.max(track, d => Number(d.frame_t));

    // Calculate total movement distance
    const movements = track.filter(validMovement);

    let totalDistance = 0;

    movements.forEach(d => {
        const dx = Number(d.position_x_t_plus_1) -
                   Number(d.position_x_t);

        const dy = Number(d.position_y_t_plus_1) -
                   Number(d.position_y_t);

        totalDistance += Math.sqrt(dx * dx + dy * dy);
    });

    detailsDiv.innerHTML = `
        <h3>Selected Track Details</h3>

        <div class="track-stats">
            <div class="track-stat">
                <span>Track ID</span>
                <strong>${trackId}</strong>
            </div>

            <div class="track-stat">
                <span>Frame Range</span>
                <strong>${firstFrame} - ${lastFrame}</strong>
            </div>

            <div class="track-stat">
                <span>Observations</span>
                <strong>${track.length}</strong>
            </div>

            <div class="track-stat">
                <span>Total Movement</span>
                <strong>${totalDistance.toFixed(2)} px</strong>
            </div>
        </div>
    `;
}



// Update the trajectory graph

const highlightColors = [
    "#E84A5F", // Coral Red
    "#FF922B", // Orange
    "#FFD43B", // Sunshine Yellow
    "#2EAD57", // Green
    "#008C95", // Teal
    "#3478F6", // Blue
    "#8950D6", // Purple
    "#E64AAB"  // Pink
];

// Update the trajectory graph
async function updateGraph() {
    const requestNumber = ++graphRequestNumber;

    const plot = document.getElementById("trajectoryPlot");

    const start = Number(startFrame.value);
    const end = Number(endFrame.value);

    updateBtn.disabled = true;
    updateBtn.textContent = "Loading...";

    try {
        if (start > end) {
            throw new Error("Start frame cannot exceed end frame.");
        }

        // Only use valid movement connections within the frame range
        const movements = currentData.filter(d =>
            validMovement(d) &&
            Number(d.frame_t) >= start &&
            Number(d.frame_t) < end
        );

        // Allow the browser to update before drawing
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (requestNumber !== graphRequestNumber) return;

        // Clear the previous graph
        plot.innerHTML = "";

        const width = Math.max(plot.clientWidth, 350);
        const height = 500;

        const margin = {
            top: 20,
            right: 20,
            bottom: 65,
            left: 65
        };

        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // D3 scales
        const xScale = d3.scaleLinear()
            .domain([0, 1250])
            .range([margin.left, margin.left + innerWidth]);

        const yMax = d3.max(currentData, d =>
            Math.max(
                Number(d.position_y_t) || 0,
                Number(d.position_y_t_plus_1) || 0
            )
        ) || 1000;

        // Reverse Y-axis to match the original Plotly graph
        const yScale = d3.scaleLinear()
            .domain([0, yMax])
            .range([margin.top, margin.top + innerHeight]);

        // Create drawing container
        const container = d3.select(plot)
            .append("div")
            .style("position", "relative")
            .style("width", "100%")
            .style("height", height + "px");

        // Canvas for movement trajectories
        const canvas = container.append("canvas")
            .attr("width", width)
            .attr("height", height)
            .style("position", "absolute")
            .style("left", "0")
            .style("top", "0")
            .node();

        const ctx = canvas.getContext("2d");

        // Background trajectories
        ctx.strokeStyle = "rgba(120,120,120,0.18)";
        ctx.lineWidth = 0.7;
        ctx.beginPath();

        movements.forEach(d => {
            ctx.moveTo(
                xScale(Number(d.position_x_t)),
                yScale(Number(d.position_y_t))
            );

            ctx.lineTo(
                xScale(Number(d.position_x_t_plus_1)),
                yScale(Number(d.position_y_t_plus_1))
            );
        });

        ctx.stroke();

        // Draw highlighted tracks
        const highlightedSegments = [];

        selectedTracks.forEach((trackId, index) => {
            const color = highlightColors[index % highlightColors.length];

            const trackMovements = movements.filter(d =>
                Number(d.track_id) === trackId
            );

            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();

            trackMovements.forEach(d => {
                const x1 = xScale(Number(d.position_x_t));
                const y1 = yScale(Number(d.position_y_t));
                const x2 = xScale(Number(d.position_x_t_plus_1));
                const y2 = yScale(Number(d.position_y_t_plus_1));

                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);

                highlightedSegments.push({
                    trackId, x1, y1, x2, y2
                });
            });

            ctx.stroke();
        });

        // SVG overlay for D3 axes
        const svg = container.append("svg")
            .attr("width", width)
            .attr("height", height)
            .style("position", "absolute")
            .style("left", "0")
            .style("top", "0")
            .style("pointer-events", "none");

        svg.append("g")
            .attr("transform",
                `translate(0,${margin.top + innerHeight})`)
            .call(d3.axisBottom(xScale));

        svg.append("g")
            .attr("transform",
                `translate(${margin.left},0)`)
            .call(d3.axisLeft(yScale));

        svg.append("text")
            .attr("x", margin.left + innerWidth / 2)
            .attr("y", height - 12)
            .attr("text-anchor", "middle")
            .text("Position X (pixels)");

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -(margin.top + innerHeight / 2))
            .attr("y", 18)
            .attr("text-anchor", "middle")
            .text("Position Y (pixels)");

        // Legend for selected tracks
        const legend = d3.select(plot)
            .append("div")
            .style("display", "flex")
            .style("flex-wrap", "wrap")
            .style("gap", "14px")
            .style("justify-content", "center")
            .style("margin-top", "10px");

        selectedTracks.forEach((trackId, index) => {
            const item = legend.append("span")
                .style("display", "inline-flex")
                .style("align-items", "center")
                .style("gap", "6px")
                .style("font-size", "13px");

            item.append("span")
                .style("width", "18px")
                .style("height", "4px")
                .style("background", highlightColors[index % highlightColors.length]);

            item.append("span")
                .text("Track " + trackId);
        });

        // Detect clicks near highlighted trajectories
        canvas.addEventListener("click", event => {
            const rect = canvas.getBoundingClientRect();

            const x = (event.clientX - rect.left) *
                      (canvas.width / rect.width);

            const y = (event.clientY - rect.top) *
                      (canvas.height / rect.height);

            let closestTrack = null;
            let closestDistance = 8;

            highlightedSegments.forEach(segment => {
                const dx = segment.x2 - segment.x1;
                const dy = segment.y2 - segment.y1;

                const lengthSquared = dx * dx + dy * dy;
                if (lengthSquared === 0) return;

                const t = Math.max(0, Math.min(1,
                    ((x - segment.x1) * dx +
                     (y - segment.y1) * dy) / lengthSquared
                ));

                const px = segment.x1 + t * dx;
                const py = segment.y1 + t * dy;

                const distance = Math.hypot(x - px, y - py);

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestTrack = segment.trackId;
                }
            });

            if (closestTrack !== null) {
                showTrackDetails(closestTrack);
            }
        });

        // Reset track details
        document.getElementById("trackDetails").innerHTML = `
            <h3>Selected Track Details</h3>
            <p>Click a colored trajectory to view its details.</p>
        `;

    } catch (error) {
        if (requestNumber === graphRequestNumber) {
            console.error(error);
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
