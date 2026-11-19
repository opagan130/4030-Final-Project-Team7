
from flask import Flask, render_template, request, jsonify
from pathlib import Path
import pandas as pd
import plotly.graph_objects as go

app = Flask(__name__)

DATA_FOLDER = Path(__file__).parent / "GT"
FILES = {f.name: f for f in DATA_FOLDER.glob("*.csv")}

def load_data(filename):
    if filename not in FILES:
        raise ValueError("Unknown sequence")

    return pd.read_csv(FILES[filename])


def valid_movements(data):
    return data[
        (data["HAS_FUTURE"] == True) &
        (data["FUTURE_STATUS"] == "ok") &
        (data["target_spot_id"] != -1)
    ].dropna(subset=[
        "position_x_t", "position_y_t",
        "position_x_t_plus_1",
        "position_y_t_plus_1"
    ])


def add_paths(fig, data, color, width, name,
              opacity=1, legend=False):

    x = []
    y = []

    for row in data.itertuples(index=False):
        x.extend([
            row.position_x_t,
            row.position_x_t_plus_1,
            None
        ])

        y.extend([
            row.position_y_t,
            row.position_y_t_plus_1,
            None
        ])

    if x:
        fig.add_trace(go.Scattergl(
            x=x,
            y=y,
            mode="lines+markers" if legend else "lines",
            name=name,
            showlegend=legend,
            hoverinfo="text" if legend else "skip",
            text=[name] * len(x) if legend else None,
            marker=dict(
                size=10 if legend else 0,
                color=color,
                opacity=0 if legend else 1
            ),
            line=dict(color=color, width=width),
            opacity=opacity
        ))


@app.route("/")
def dashboard():
    return render_template("dashboard.html")


@app.route("/api/sequences")
def sequences():
    return jsonify(sorted(FILES.keys()))


@app.route("/api/tracks")
def tracks():
    filename = request.args.get("sequence", "")

    if filename not in FILES:
        return jsonify({"error": "Invalid sequence"}), 400

    data = load_data(filename)

    ids = sorted(
        int(i) for i in data["track_id"].dropna().unique()
    )

    return jsonify({
        "tracks": ids,
        "min_frame": int(data["frame_t"].min()),
        "max_frame": int(data["frame_t"].max()),
        "observations": len(data)
    })


@app.route("/api/trajectory")
def trajectory():
    filename = request.args.get("sequence", "")

    if filename not in FILES:
        return jsonify({"error": "Invalid sequence"}), 400

    data = load_data(filename)

    try:
        selected = [
            int(i) for i in
            request.args.get("tracks", "").split(",")
            if i.strip()
        ]

        start = int(request.args.get(
            "start", data["frame_t"].min()
        ))

        end = int(request.args.get(
            "end", data["frame_t"].max()
        ))

    except ValueError:
        return jsonify({"error": "Invalid filter"}), 400

    if start > end:
        return jsonify({"error": "Invalid frame range"}), 400

    movements = valid_movements(data)

    movements = movements[
        (movements["frame_t"] >= start) &
        (movements["frame_t"] < end)
    ]

    fig = go.Figure()

    # Background: all movements in this sequence
    add_paths(
        fig, movements,
        "rgba(120,120,120,0.18)",
        0.7, "Other tracks"
    )

    # Highlight selected lineages
    colors = [
        "#F28B82", "#E5C65B",
        "#81C995", "#65C9C0", "#8AB4F8", "#B39DDB", "#F48FB1"
    ]

    for i, track_id in enumerate(selected):
        track = movements[
            movements["track_id"] == track_id
        ]

        add_paths(
            fig, track,
            colors[i % len(colors)],
            2.5,
            f"Track {track_id}",
            legend=True
        )

    fig.update_layout(
        title=None,
        xaxis_title="Position X (pixels)",
        yaxis_title="Position Y (pixels)",
        yaxis=dict(
            autorange="reversed",
        ),
        xaxis=dict(
            range=[0, 1250],
            constrain="domain"
        ),
        template="plotly_white",
        margin=dict(l=55, r=15, t=15, b=45),
        legend=dict(orientation="h", y=-0.2),
        uirevision=filename
    )

    return jsonify(fig.to_plotly_json())


@app.route("/api/track-details")
def track_details():
    filename = request.args.get("sequence", "")

    if filename not in FILES:
        return jsonify({"error": "Invalid sequence"}), 400

    try:
        track_id = int(request.args.get("track_id", ""))
    except ValueError:
        return jsonify({"error": "Invalid Track ID"}), 400

    data = load_data(filename)

    track = data[data["track_id"] == track_id]

    if track.empty:
        return jsonify({"error": "Track not found"}), 404

    # Frame range for the selected lineage
    first_frame = int(track["frame_t"].min())
    last_frame = int(track["frame_t"].max())

    # Only count valid recorded movement connections
    movements = valid_movements(track)

    # Calculate total movement distance in pixels
    dx = (
        movements["position_x_t_plus_1"]
        - movements["position_x_t"]
    )

    dy = (
        movements["position_y_t_plus_1"]
        - movements["position_y_t"]
    )

    total_distance = ((dx ** 2 + dy ** 2) ** 0.5).sum()

    return jsonify({
        "track_id": track_id,
        "first_frame": first_frame,
        "last_frame": last_frame,
        "observations": len(track),
        "total_distance": round(float(total_distance), 2)
    })



if __name__ == "__main__":
    app.run(debug=True)
