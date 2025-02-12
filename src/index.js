import MathExtas from "./MathExtras.js";
import PathExtras from "./PathExtras.js";

// Default settings
const defStrokeParam = {
  // Line function for drawing (must convert coordinates to a valid path string)
  lineFunc: PathExtras.coordsToPath,
  // Minimum distance between points that is allowed (longer will be interpolated)
  minDist: 2,
  // Max time between events (done to somewhat keep a stable sample rate)
  maxTimeDelta: 5,
};

const defEraserParam = {
  eraserMode: "object", // Can use "object" or "pixel"
  eraserSize: 20, // NOTE: Small eraser sizes will cause skipping isses - will need to be fixed
};

const defStrokeStyles = {
  stroke: "black",
  "stroke-width": "1px",
  "stroke-linecap": "round",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
};

const defEraserStyles = {
  "pointer-events": "none",
  "z-index": 999,
  fill: "rgba(0,0,0, 0.5)",
};

class PointerState {
  pointerId;
  pointerType;
  button;
  buttonName;
  actionName;
  action;

  constructor(pointerEvent) {
    this.pointerId = pointerEvent.pointerId;
    this.pointerType = pointerEvent.pointerType;
    this.button = pointerEvent.button;
    this.buttonName = {
      // https://www.w3.org/TR/pointerevents/#the-button-property
      0: "normal",  // Mouse Left   , Pen Tip   , Touch contact
      1: "middle",  // Mouse Middle
      2: "right",   // Mouse Right  , Pen Barrel
      3: "back",    // Mouse Back
      4: "forward", // Mouse Forward
      5: "eraser",  // (no mouse)   , Pen Eraser
    }[this.button];
    this.actionName = {
      "normal": "drawing",
      "right" : "erasing",
      "eraser": "erasing",
    }[this.buttonName];
    this.action = null;
  }
}

class BaseAction {
  coords;
  constructor() {
    this.coords = [];
  }
}
class DrawingAction extends BaseAction {
  svgPenSketch;
  svgPath;
  constructor(svgPenSketch) {
    super();
    this.svgPenSketch = svgPenSketch;
    this.svgPath = null;
  }
  start(pointerState, ev) {
    this.svgPath = this.svgPenSketch._createElement("path");
    this._appendMouseCoord(pointerState, ev);
  }
  move(pointerState, ev) {
    this._appendMouseCoord(pointerState, ev);
  }
  stop(pointerState, ev) {
  }
  _appendMouseCoord(pointerState, ev) {
    const [x, y] = this.svgPenSketch._getMousePos(ev);
    this.coords.push([x, y]);
    this.svgPath.setAttribute("d", this.svgPenSketch.strokeParam.lineFunc(this.coords));
  }
}

class PressureDrawingAction extends BaseAction {
  svgPenSketch;
  svgGroup;
  constructor(svgPenSketch) {
    super();
    this.svgPenSketch = svgPenSketch;
    this.svgGroup = null;
  }
  start(pointerState, ev) {
    this.svgGroup = this.svgPenSketch._createElement("g");
    // TODO: Greatly simplify this logic. Get rid of CSS calc(), and compute everything in just plain JavaScript.
    const fallbackWidth = this.svgGroup.style.getPropertyValue("stroke-width") || "1px";
    this.svgGroup.style.setProperty("--min-stroke-width", this.svgGroup.style.getPropertyValue("--min-stroke-width") || `calc(${fallbackWidth} / 2)`);
    this.svgGroup.style.setProperty("--max-stroke-width", this.svgGroup.style.getPropertyValue("--max-stroke-width") || `calc(${fallbackWidth} * 2)`);
    this.svgGroup.style.setProperty("stroke-width", "calc(var(--min-stroke-width) + ( var(--max-stroke-width) - var(--min-stroke-width) ) * var(--pressure))");
    this._appendMouseCoord(pointerState, ev);
  }
  move(pointerState, ev) {
    this._appendMouseCoord(pointerState, ev);
  }
  stop(pointerState, ev) {
  }
  _appendMouseCoord(pointerState, ev) {
    const [x, y] = this.svgPenSketch._getMousePos(ev);
    // 3 digits of precision is good enough for 1000 levels of pressure.
    // If needed, we can increse it to 4 digits, but that's likely an overkill.
    const pressure = (ev.pressure === undefined ? 0.5 : +ev.pressure).toFixed(3);
    console.log(ev.name, ev.type, ev.pressure);

    // TODO: add support for dots (single points with zero length).
    if (this.coords.length > 0) {
      // Previous point:
      const [px, py, pp] = this.coords.at(-1);

      // TODO: reuse the previous path if the pressure amount is the same.

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      // Should we use the current pressure or the last pressure?
      // Or an average of both?
      path.style.setProperty("--pressure", pressure);
      //path.style.setProperty("--pressure", pp);
      //path.style.setProperty("--pressure", ((+pressure + +pp) / 2).toFixed(3));

      path.setAttribute("d", this.svgPenSketch.strokeParam.lineFunc([[px, py], [x, y]]));
      this.svgGroup.append(path);
    }

    this.coords.push([x, y, pressure]);
  }
}


class ErasingAction extends BaseAction {
  svgPenSketch;
  constructor(svgPenSketch) {
    super();
    this.svgPenSketch = svgPenSketch;
  }
  start(pointerState, ev) {
    const [x, y] = this.svgPenSketch._getMousePos(ev);
    //this.coords.push([x, y]);
    this.svgPenSketch._createEraserHandle(x, y);
  }
  move(pointerState, ev) {
    const [x, y] = this.svgPenSketch._getMousePos(ev);
    let affectedPaths = null;

    // Move the eraser cursor
    this.svgPenSketch._moveEraserHandle(x, y);

    // Add the points
    //this.coords.push([x, y]);

    switch (this.svgPenSketch.eraserParam.eraserMode) {
      case "object":
        // Remove any paths in the way
        affectedPaths = this.svgPenSketch.removePaths(
          x,
          y,
          this.svgPenSketch.eraserParam.eraserSize / 2
        );
        break;
      case "pixel":
        affectedPaths = this.svgPenSketch.erasePaths(
          x,
          y,
          this.svgPenSketch.eraserParam.eraserSize / 2
        );
        break;
      default:
        console.error("ERROR: INVALID ERASER MODE");
        break;
    }

  }
  stop(pointerState, ev) {
    this.svgPenSketch._removeEraserHandle();
  }
}

export default class SvgPenSketch {
  _element;
  _pointers;
  parentScale;
  strokeParam;
  strokeStyles;
  eraserParam;
  eraserStyles;
  penDownCallback;
  penUpCallback;
  eraserDownCallback;
  eraserUpCallback;

  constructor(
    element = null,
    strokeStyles = {},
    strokeParam = {},
    eraserParam = {},
    eraserStyles = {}
  ) {
    // If the element is a valid
    if (element && typeof element === "object" && element.nodeType === Node.ELEMENT_NODE) {
      // Private variables
      // The root SVG element
      this._element = element;
      // Map of active pointers
      this._pointers = {};

      // Resize the canvas viewbox on window resize
      // TODO: Need to implement a proper fix to allow paths to scale
      // window.onresize = _ => {
      //     this.resizeCanvas();
      // };
      this.addEventListeners();

      // Public variables
      // Handles scaling of parent components
      this.parentScale = 1;
      // Stroke parameters
      this.strokeParam = { ...defStrokeParam, ...strokeParam };
      // Styles for the stroke
      this.strokeStyles = { ...defStrokeStyles, ...strokeStyles, fill: "none" };
      // Eraser paraneters
      this.eraserParam = { ...defEraserParam, ...eraserParam };
      // Styles for the Eraser
      this.eraserStyles = { ...defEraserStyles, ...eraserStyles };
      // Pen Callbacks
      this.penDownCallback = (_) => {};
      this.penUpCallback = (_) => {};
      // Eraser Callbacks
      this.eraserDownCallback = (_) => {};
      this.eraserUpCallback = (_) => {};
    } else {
      throw new Error(
        "svg-pen-sketch needs a svg element in the constructor to work"
      );
    }
  }

  // Public functions
  getElement() {
    return this._element;
  }

  // Not being used at the moment
  resizeCanvas() {
    let bbox = this._element.getBoundingClientRect();
    this._element.setAttribute("viewBox", "0 0 " + bbox.width + " " + bbox.height);
  }

  // Gets the path elements in a specified range
  // Uses their bounding boxes, so we can't tell if we're actually hitting the stroke with this
  // Just to determine if a stroke is close
  getPathsinRange(x, y, range = 1) {
    // The eraser bounds
    let x1 = x - range,
      x2 = x + range,
      y1 = y - range,
      y2 = y + range;
    let paths = [];

    for (let path of this._element.querySelectorAll("path")) {
      // Get the bounding boxes for all elements on page
      let bbox = PathExtras.getCachedPathBBox(path);

      // If the eraser and the bounding box for the path overlap
      // and we havent included it already
      if (
        !(
          bbox.x > x2 ||
          bbox.y > y2 ||
          x1 > bbox.x + bbox.width ||
          y1 > bbox.y + bbox.height
        ) &&
        !paths.includes(path)
      ) {
        paths.push(path);
      }
    }
    return paths;
  }

  // Remove a stroke if it's within range and the mouse is over it
  removePaths(x, y, eraserSize = 1) {
    // Prep variables
    let removedPathIDs = [];

    // Get paths in the eraser's range
    let paths = this.getPathsinRange(x, y, eraserSize);

    // For each path found, remove it
    for (let path of paths) {
      let pathCoords = PathExtras.pathToCoords(path.getAttribute("d"));
      if (
        PathExtras.pathCoordHitTest(pathCoords, x, y, eraserSize).length > 0
      ) {
        removedPathIDs.push(path.getAttribute("id"));
        path.remove();
      }
    }
    return removedPathIDs;
  }

  // Edit (erase) a portion of a stroke
  erasePaths(x, y, eraserSize = 1) {
    // The paths within the bounds
    let paths = this.getPathsinRange(x, y, eraserSize);

    // The resultant edited paths
    let pathElements = [];

    for (let originalPath of paths) {
      let pathCoords = PathExtras.pathToCoords(originalPath.getAttribute("d"));

      let newPaths = []; // The series of stroke coordinates to add
      let indicies = PathExtras.pathCoordHitTest(pathCoords, x, y, eraserSize);

      if (indicies.length > 0) {
        // Add the path before the eraser
        newPaths.push(pathCoords.slice(0, indicies[0]));
        // Add the in-between parts of the edited path
        for (let i = 0; i < indicies.length - 1; i++) {
          if (indicies[i + 1] - indicies[i] > 1) {
            newPaths.push(pathCoords.slice(indicies[i], indicies[i + 1]));
          }
        }
        // Add the path after the eraser
        newPaths.push(
          pathCoords.slice(indicies[indicies.length - 1] + 1, pathCoords.length)
        );

        // Remove paths of only 1 coordinate
        newPaths = newPaths.filter((p) => (p.length > 2 ? true : false));

        // Add the new paths if they have two or more sets of coordinates
        // Prevents empty paths from being added
        for (let newPath of newPaths) {
          let strokePath = this._createElement("path");

          // Copy the styles of the original stroke
          strokePath.setAttribute("d", this.strokeParam.lineFunc(newPath));
          strokePath.setAttribute("style", originalPath.getAttribute("style"));
          strokePath.setAttribute("class", originalPath.getAttribute("class"));
          pathElements.push(strokePath);
        }

        // Remove the original path
        originalPath.remove();
      }
    }

    return pathElements;
  }

  // Private functions
  _createEraserHandle(x, y) {
    // Prep the eraser hover element
    this._eraserHandle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    this._eraserHandle.setAttribute("class", "eraserHandle");
    this._eraserHandle.setAttribute("width", this.eraserParam.eraserSize);
    this._eraserHandle.setAttribute("height", this.eraserParam.eraserSize);
    this._eraserHandle.setAttribute("x", x - this.eraserParam.eraserSize / 2);
    this._eraserHandle.setAttribute("y", y - this.eraserParam.eraserSize / 2);
    this._element.append(this._eraserHandle);

    // Hide the mouse cursor
    this._element.style.cursor = "none";

    // Apply all user-desired styles
    for (let styleName in this.eraserStyles) {
      this._eraserHandle.style.setProperty(styleName, this.eraserStyles[styleName]);
    }
  }

  _moveEraserHandle(x, y) {
    if (this._eraserHandle) {
      this._eraserHandle.setAttribute("x", x - this.eraserParam.eraserSize / 2);
      this._eraserHandle.setAttribute("y", y - this.eraserParam.eraserSize / 2);
    }
  }

  _removeEraserHandle() {
    if (this._eraserHandle) {
      this._eraserHandle.remove();
      this._eraserHandle = null;
      this._element.style.cursor = null;
    }
  }

  static eventListeners = [
    "pointerdown",
    "touchstart",
    "contextmenu",
    "pointermove",
    //"pointerrawupdate",
    "pointerup",
    "pointercancel",
  ];
  addEventListeners() {
    for (const eventType of SvgPenSketch.eventListeners) {
      this._element.addEventListener(eventType, this);
    }
  }
  removeEventListeners() {
    for (const eventType of SvgPenSketch.eventListeners) {
      this._element.removeEventListener(eventType, this);
    }
  }

  // Special function called "handleEvent".
  // This is needed so we can have access to `this`,
  // while also being able to removeEventListener later.
  handleEvent(ev) {
    const fn_name = "_handle_" + ev.type;
    if (this[fn_name]) return this[fn_name](ev);
  }

  _handle_touchstart(ev) {
    // Stop touch scrolling
    ev.preventDefault();
  }
  _handle_contextmenu(ev) {
    // Stop the context menu from appearing
    ev.preventDefault();
  }

  // Handles the different pointers
  // Also allows for pens to be used on modern browsers
  _handle_pointerdown(ev) {
    const state = new PointerState(ev);
    this._pointers[state.pointerId] = state;

    console.log(ev.type, ev.pointerType, ev.button, ev.buttons);
    switch (state.actionName) {
      case "drawing":
        if (ev.pressure === undefined) {
          state.action = new DrawingAction(this);
        } else {
          state.action = new PressureDrawingAction(this);
        }
        break;

      case "erasing":
        state.action = new ErasingAction(this);
        break;
    }
    if (state.action) {
      state.action.start(state, ev);
      ev.preventDefault();
    }
  }

  // Creates a new pointer event that can be modified
  _createEvent() {
    let newEvent = {};
    let features = [
      "screenX",
      "screenY",
      "clientX",
      "clientY",
      "offsetX",
      "offsetY",
      "pageX",
      "pageY",
      "pointerType",
      "pressure",
      "movementX",
      "movementY",
      "tiltX",
      "tiltY",
      "twistX",
      "twistY",
      "timeStamp",
    ];

    for (let feat of features) {
      newEvent[feat] = ev[feat];
    }
    return newEvent;
  }

  // Handles the creation of this._currPointerEvent and this._prevPointerEvent
  // Also interpolates between events if needed to keep a particular sample rate
  //_handle_pointerrawupdate(ev) {
  _handle_pointermove(ev) {
    if (ev.getCoalescedEvents) {
      for (const cev of ev.getCoalescedEvents()) {
        this._handle_pointermove_coalesced(cev);
      }
    } else {
      this._handle_pointermove_coalesced(ev);
    }
    // FIXME TODO: Somehow, multi-touch isn't working smoothly on Firefox Android. And I don't know why.
  }
  _handle_pointermove_coalesced(ev) {
    const state = this._pointers[ev.pointerId];
    if (!state || !state.action) {
      return;
    }
    state.action.move(state, ev);

    // Call the callback
    switch (state.actionName) {
      case "drawing":
        this.penDownCallback?.(state.action.svgPath, ev);
        break;
      case "erasing":
        this.eraserDownCallback?.([], ev);  // TODO: pass the affected callbacks
        break;
    }

    // if (this._prevPointerEvent) {
    //   let timeDelta = ev.timeStamp - this._prevPointerEvent.timeStamp;

    //   if (timeDelta > this.strokeParam.maxTimeDelta * 2) {
    //     // Calculate how many interpolated samples we need
    //     const numSteps = Math.floor(timeDelta / this.strokeParam.maxTimeDelta) + 1;
    //     const step = timeDelta / numSteps / timeDelta;

    //     // For each step
    //     for (let i = step; i < 1; i += step) {
    //       // Make a new event based on the current event
    //       let newEvent = this._createEvent(ev);
    //       for (let feat in newEvent) {
    //         // For every feature (that is a number)
    //         if (!isNaN(parseFloat(newEvent[feat]))) {
    //           // Linearly interpolate it
    //           newEvent[feat] = MathExtas.lerp(
    //             this._prevPointerEvent[feat],
    //             newEvent[feat],
    //             i
    //           );
    //         }
    //       }
    //       this._currPointerEvent = newEvent;
    //       callback();
    //     }
    //   }
    // }

    // // Call the proper callback with the "real" event
    // this._currPointerEvent = this._createEvent(ev);
    // callback();
    // this._prevPointerEvent = this._currPointerEvent;
  }

  // Handles the removal of this._currPointerEvent and this._prevPointerEvent
  _handle_pointerup(ev) {
    const state = this._pointers[ev.pointerId];
    delete this._pointers[ev.pointerId];
    if (!state || !state.action) {
      return;
    }
    state.action.stop(state, ev);

    // Call the callback
    switch (state.actionName) {
      case "drawing":
        this.penUpCallback?.(state.action.svgPath, ev);
        break;
      case "erasing":
        this.eraserUpCallback?.(ev);
        break;
    }
  }

  _handle_pointercancel(ev) {
    // TODO: Delete the path. in this case.
    const state = this._pointers[ev.pointerId];
    delete this._pointers[ev.pointerId];
    if (!state || !state.action) {
      return;
    }
    state.action.stop(state, ev);

    // Call the callback
    this.penUpCallback?.(state.action.svgPath, ev);
  }


  // Creates a new path on the screen
  _createElement(tagName) {
    let strokePath = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    this._element.append(strokePath);

    // Generate a random ID for the stroke
    let strokeID = Math.random().toString(32).substr(2, 9);
    strokePath.setAttribute("id", strokeID);

    // Apply all user-desired styles
    for (let styleName in this.strokeStyles) {
      strokePath.style.setProperty(styleName, this.strokeStyles[styleName]);
    }

    return strokePath;
  }

  // Gets the mouse position on the canvas
  _getMousePos(ev) {
    let canvasContainer = this._element.getBoundingClientRect();

    // Calculate the offset using the page location and the canvas' offset (also taking scroll into account)
    let x = (ev.pageX - canvasContainer.x) / this.parentScale - document.scrollingElement.scrollLeft;
    let y = (ev.pageY - canvasContainer.y) / this.parentScale - document.scrollingElement.scrollTop;

    return [x, y];
  }

  // Interpolate coordinates in the paths in order to keep a min distance
  _interpolateStroke(strokePath, penCoords) {
    // Fill in the path if there are missing nodes
    let newPath = [];
    for (let i = 0; i <= penCoords.length - 2; i++) {
      // Get the current and next coordinates
      let currCoords = penCoords[i];
      let nextCoords = penCoords[i + 1];
      newPath.push(currCoords);

      // If the distance to the next coord is too large, interpolate between
      let dist = MathExtas.getDist(
        currCoords[0],
        currCoords[1],
        nextCoords[0],
        nextCoords[1]
      );
      if (dist > this.strokeParam.minDist * 2) {
        // Calculate how many interpolated samples we need
        let step = Math.floor((dist / this.strokeParam.minDist) * 2) + 1;
        // Loop through the interpolated samples needed - adding new coordinates
        for (let j = dist / step / dist; j < 1; j += dist / step / dist) {
          newPath.push([
            MathExtas.lerp(currCoords[0], nextCoords[0], j),
            MathExtas.lerp(currCoords[1], nextCoords[1], j),
          ]);
        }
      }

      // Add the final path
      if (i == penCoords.length - 2) {
        newPath.push(nextCoords);
      }
    }

    // Update the stroke
    strokePath.setAttribute("d", this.strokeParam.lineFunc(newPath));
  }

  // Stop the drawing
  _stopDraw(strokePath, penCoords) {

    // Interpolate the path if needed
    this._interpolateStroke(strokePath, penCoords);

    // Call the callback
    if (this.penUpCallback != undefined) {
      this.penUpCallback(strokePath, this._currPointerEvent);
    }
  }

}
