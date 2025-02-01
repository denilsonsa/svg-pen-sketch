// Receives [x, y]
// Returns "123.4 567.8"
function coordsToString(coords) {
  return coords.map(v => v.toFixed(1)).join(",");
}

function coordsToPath(points) {
  if (points.length == 0) {
    return "";
  } else if (points.length == 1) {
    return `M${coordsToString(points[0])}Z`;
  } else {
    return points.map((coords, index) =>
        `${index == 0 ? "M" : "L"}${coordsToString(coords)}`
    ).join("");
  }
}

function pathToCoords(pathStr) {
  let commands = pathStr.split(/(?= *[LMCZ] *)/);
  let points = commands.map(function (point) {
    if (point.trim()) {
      // Trim the path string and convert it
      let coords = point.trim().slice(1).split(/[ ,]/);

      // Convert the coords to a float
      coords[0] = parseFloat(coords[0]);
      coords[1] = parseFloat(coords[1]);
      return coords;
    }
  });
  return points;
}

function getCachedPathBBox(path) {
  if (!path._boundingClientRect) {
    path._boundingClientRect = path.getBBox();
  }
  return path._boundingClientRect;
}

function pathCoordHitTest(pathCoords, x, y, range = 1) {
  // The bounds
  let xLowerBounds = x - range,
    xUpperBounds = x + range,
    yLowerBounds = y - range,
    yUpperBounds = y + range;
  // The indicies of the path coord array that the eraser is over
  let hitIndicies = [];

  for (let i = 0; i < pathCoords.length; i++) {
    let xCoord = pathCoords[i][0],
      yCoord = pathCoords[i][1];

    // If the particular point on the line is within the erasing area
    // Eraser area = eraser point +- eraserSize in the X and Y directions
    if (
      xLowerBounds <= xCoord &&
      xCoord <= xUpperBounds &&
      yLowerBounds <= yCoord &&
      yCoord <= yUpperBounds
    ) {
      // If we need to erase this point just create a seperation between the last two points
      // The seperation is done by creating two new paths
      hitIndicies.push(i);
    }
  }

  return hitIndicies;
}

const PathExtras = {
  coordsToPath: coordsToPath,
  pathToCoords: pathToCoords,
  getCachedPathBBox: getCachedPathBBox,
  pathCoordHitTest: pathCoordHitTest,
};

Object.freeze(PathExtras);
export default PathExtras;
