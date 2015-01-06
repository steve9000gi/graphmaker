// Build a graph with nodes of several shapes and colors, and connect them with directed edges.
// Save a constructed graph locally as a json file, and open and display saved graph files.
// Author: Steve Chall, RENCI UNC-CH
// Based on Colorado Reed's https://github.com/cjrd/directed-graph-creator.

document.onload = (function(d3, saveAs, Blob, undefined) {
  "use strict";

  // Define graphcreator object
  var Graphmaker = function(svg, nodes, links) {
    var thisGraph = this;
    thisGraph.idct = 0;
    thisGraph.clr = "#000000";
    thisGraph.edgeStyle = "solid";
    thisGraph.minRectSide = 
      Math.sqrt(Math.PI * thisGraph.consts.minCircleRadius * thisGraph.consts.minCircleRadius);
    thisGraph.shapeSelected = "circle";
    thisGraph.maxCharsPerLine = 20; 
    thisGraph.boldFontWeight = 900;
    thisGraph.edgeNum = 0;

    thisGraph.nodes = nodes || [];
    thisGraph.links = links || [];

    thisGraph.state = {
      selectedNode: null,
      selectedEdge: null,
      mouseDownNode: null,
      mouseDownLink: null,
      justDragged: false,
      justScaleTransGraph: false,
      lastKeyDown: -1,
      shiftNodeDrag: false,
      selectedText: null
    };

    thisGraph.prepareToolbox();

    // Define arrow markers for graph links (i.e., edges that persist after mouse up)
    var defs = d3.select("svg").append("svg:defs");
    defs.selectAll("marker")
	.data(thisGraph.colorChoices)
	.enter().append("marker")
	  .attr("id", function(d) { return "end-arrow" + d; })
	  .attr("viewBox", "0 -5 10 10")
	  .attr("markerWidth", 3.5)
	  .attr("markerHeight", 3.5)
	  .attr("orient", "auto")
	  .attr("fill", function(d) { return "#" + d; })
	  .attr("stroke", "none")
	.append("svg:path")
	  .attr("d", "M0,-5L10,0L0,5");

    // Special-purpose markers for leading arrow (just while dragging), for selected, and for hover:
    var markerData = [{"id": "mark-end-arrow", "fill": "#000000"},
		      {"id": "selected-end-arrow", "fill": thisGraph.consts.selectedColor},
		      {"id": "hover-end-arrow", "fill": thisGraph.consts.hoverColor}];
    defs.selectAll(".specialMarker")
	.data(markerData)
	.enter().append("marker")
          .classed("specialMarker", true)
	  .attr("id", function(d) { return d.id; })
	  .attr("viewBox", "0 -5 10 10")
	  .attr("markerWidth", 3.5)
	  .attr("markerHeight", 3.5)
	  .attr("orient", "auto")
	.append("svg:path")
	  .attr("fill", function(d, i) { return markerData[i].fill; })
	  .attr("stroke", "none")
	  .attr("d", "M0,-5L10,0L0,5");

    thisGraph.svg = svg;
    thisGraph.svgG = svg.append("g").classed(thisGraph.consts.graphClass, true)
                        .attr("id", "graphG");
    var svgG = thisGraph.svgG;

    thisGraph.createCirclesOfCare();

    // Displayed when dragging between nodes
    thisGraph.dragLine = svgG.append("svg:path")
      .attr("class", "link dragline hidden")
      .attr("d", function(d) { return "M0,0L0,0"; })
      .style("marker-end", "url(#mark-end-arrow)");

    // Svg nodes and links
    thisGraph.edgeGroups = svgG.append("g").selectAll("g");
    thisGraph.shapeGroups = svgG.append("g").selectAll("g");

    thisGraph.drag = d3.behavior.drag()
      .origin(function(d) {
	return {x: d.x, y: d.y};
      })
      .on("drag", function(args) {
	thisGraph.state.justDragged = true;
	thisGraph.dragmove.call(thisGraph, args);
      })
      .on("dragend", function() {
	// Todo check if edge-mode is selected
      });

    // Listen for key events
    d3.select(window).on("keydown", function() {
      thisGraph.svgKeyDown.call(thisGraph);
    })
    .on("keyup", function() {
      thisGraph.svgKeyUp.call(thisGraph);
    });
    svg.on("mousedown", function(d) { thisGraph.svgMouseDown.call(thisGraph, d); });
    svg.on("mouseup", function(d){
      thisGraph.svgMouseUp.call(thisGraph, d);
    });

    // Listen for dragging
    var dragSvg = d3.behavior.zoom()
      .on("zoom", function() {
	if (d3.event.sourceEvent.shiftKey) {
	  // TODO  the internal d3 state is still changing
	  return false;
	} else {
	  thisGraph.zoomed.call(thisGraph);
	}
	return true;
      })
      .on("zoomstart", function() {
	var ael = d3.select("#" + thisGraph.consts.activeEditId).node();
	if (ael) {
	  ael.blur();
	}
	if (!d3.event.sourceEvent.shiftKey) d3.select("body").style("cursor", "move");
      })
      .on("zoomend", function() {
	d3.select("body").style("cursor", "auto");
      });

    svg.call(dragSvg).on("dblclick.zoom", null);

    // Listen for resize
    window.onresize = function() {thisGraph.updateWindow(svg);};

    // Handle download data
    d3.select("#download-input").on("click", function() {
      var saveEdges = [];
      thisGraph.links.forEach(function(val, i) {
        saveEdges.push({source: val.source.id, target: val.target.id, style: val.style,
                        color: val.color, name: val.name});
      });
      var blob = new Blob([window.JSON.stringify({"nodes": thisGraph.nodes,
                                                  "links": saveEdges,
                                                  "circlesOfCareCenter": thisGraph.CofCC})], 
                                                 {type: "text/plain;charset=utf-8"});
      saveAs(blob, "graph.json");
    });

    // Handle uploaded data
    d3.select("#upload-input").on("click", function() {
      document.getElementById("hidden-file-upload").click();
    });
    d3.select("#hidden-file-upload").on("change", function() {
      if (window.File && window.FileReader && window.FileList && window.Blob) {
        var uploadFile = this.files[0];
        var filereader = new window.FileReader();

        filereader.onload = function() {
          var txtRes = filereader.result;
          // TODO better error handling
          try {
            var jsonObj = JSON.parse(txtRes);
            thisGraph.deleteGraph(true);
            thisGraph.nodes = jsonObj.nodes;
            thisGraph.setIdCt(thisGraph.getBiggestNodeID() + 1);
            var newEdges = jsonObj.links;
            newEdges.forEach(function(e, i) {
              newEdges[i] = {source: thisGraph.nodes.filter(function(n) {
                              return n.id === e.source; })[0],
                             target: thisGraph.nodes.filter(function(n) {
                              return n.id === e.target; })[0],
                             style: (e.style === "dashed" ? "dashed" : "solid"),
                             color: e.color,
                             name: e.name};
            });
            thisGraph.links = newEdges;

            thisGraph.hideCirclesOfCare();
            thisGraph.CofCC = jsonObj.circlesOfCareCenter;
            if (thisGraph.CofCC) {
              thisGraph.showCirclesOfCare(thisGraph)
            }
            thisGraph.updateGraph();
          } catch(err) {
            window.alert("Error parsing uploaded file\nerror message: " + err.message);
            return;
          }
        };
        filereader.readAsText(uploadFile);
      } else {
        alert("Your browser won't let you save this graph -- try upgrading your browser to IE 10+ "
            + "or Chrome or Firefox.");
      }
    });
  }; // end Graphmaker(...)


  Graphmaker.prototype.consts =  {
    selectedClass: "selected",
    connectClass: "connect-node",
    shapeGClass: "shapeG",
    pathGClass: "pathG",
    graphClass: "graph",
    activeEditId: "active-editing",
    BACKSPACE_KEY: 8,
    DELETE_KEY: 46,
    ENTER_KEY: 13,
    minCircleRadius: 20,
    minDiamondDim: 45,
    minEllipseRx: 25,
    minEllipseRy: 17,
    defaultNodeText: "node ",
    defaultEdgeText: "edge ",
    selectedColor: "rgb(229, 172, 247)",
    unselectedStyleColor: "#666666",
    hoverColor: "rgb(200, 238, 241)",
    ssSquareY: 47,
    ssDiamondY: 18,
    ssEllipseCy: 156,
    ssNoBorderXformY: 163,
    esDashedEdgeRectY: 15 // EdgeSelection
  };

  /* PROTOTYPE FUNCTIONS */

  // Edge, shape, and color selection, plus "?" help and Options buttons, load, save, and delete.
  Graphmaker.prototype.prepareToolbox = function() {
    var thisGraph = this;
    thisGraph.sssw = thisGraph.consts.minCircleRadius * 4 + 23; // Shape Selection Svg Width
    thisGraph.sssh = thisGraph.consts.minCircleRadius * 10; // Shape Selection Svg Height
    thisGraph.ssCircleCy = thisGraph.consts.minCircleRadius * 2 - 16; // ShapeSelectionCircleCy
    thisGraph.esEdgeX1 = thisGraph.sssw / 5 - 20; 
    thisGraph.CofCC = null; // CirclesOfCareCenter

    // Handle delete graph
    d3.select("#delete-graph").on("click", function() {
      thisGraph.deleteGraph(false);
    });

    // Help/instructions button and info box:
    d3.select("#toolbox").insert("div", ":first-child")
      .attr("id", "btnDiv")
      .append("input")
      .attr("type", "button")
      .attr("id", "helpBtn")
      .attr("value", "?")
      .on("click", function(d) {
	 alert("\u26a1 Drag/scroll to translate/zoom.\n"
	      + "\u26a1 Click on a shape in the toolbar to select node shape (or for a node with "
              + "none use \"no border\").\n"
	      + "\u26a1 Click on a color in the toolbar to select a color for creating new nodes "
              + "and edges.\n"
	      + "\u26a1 Shift-click on empty space to create a node of the selected shape and "
              + "color.\n"
	      + "\u26a1 Click on an arrow in the toolbar to select edge style: dashed or solid.\n"
	      + "\u26a1 Shift-click on a node, then drag to another node to connect them with an "
	      + "edge.\n"
	      + "\u26a1 Shift-click on a node's text to edit.\n"
	      + "\u26a1 Shift-click on an edge to edit text.\n"
	      + "\u26a1 Click on node or edge to select and press backspace/delete to delete."
              + " Note: a node's background turns blue when you're hovering over it, and pink when "
              + "selected.\n"
	      + "\u26a1 Control-click on a node with underlined text to open the external url "
              + "associated with that node.\n"
	      + "\u26a1 Alt-click on a node to see, attach new (or change existing) url.\n"
	      + "\u26a1 Click on the cloud with the up-arrow to open/upload a file from your "
	      + "machine.\n"
	      + "\u26a1 Click on the square with the down-arrow to save the graph to your "
              + "computer.\n"
       );
    });

    // Options:
    thisGraph.createOptionsMenu();
    d3.select("#btnDiv")
      .append("input")
        .attr("type", "button")
        .attr("id", "optionsBtn")
        .attr("value", "Options")
        .on("click", function(d) {
          var rect = d3.select("#menuDiv").node().getBoundingClientRect();
          var position = d3.mouse(d3.select("#graph")[0][0]);
          position[1] -= 120;
          d3.select("#menuDiv")
            .classed("menuHidden", false).classed("menu", true)
            .style("left", position[0] + "px")
            .style("top", position[1] + "px");
        });
    
    // Create color palette:
    d3.select("#toolbox").insert("div", ":first-child")
      .attr("id", "colorPalette");
    d3.select("#colorPalette").selectAll(".colorBar")
        .data(thisGraph.colorChoices)
      .enter().append("div")
        .classed("colorBar", true)
        .attr("id", function(d) { return "clr" + d; })
        .style("background-color", function(d) { return "#" + d; })
      .on("mouseover", function(d) { // Set border to hoverColor if this colorBar is not selected
        var currentColorBar = d3.select(this);
        var currentIdFragment = currentColorBar.attr("id").slice(3);
        if (currentIdFragment !== thisGraph.clr.slice(1)) {
          currentColorBar.style("border-color", thisGraph.consts.hoverColor);
        }
      })
      .on("mouseout", function(d) { // Set border to black if this colorBar is not selected
        var currentColorBar = d3.select(this);
        var currentIdFragment = currentColorBar.attr("id").slice(3);
        if (currentIdFragment !== thisGraph.clr.slice(1)) {
          currentColorBar.style("border-color", "#000000");
        }
      })

      .on("mouseup", function(d) {
        thisGraph.clr = "#" + d; 
        d3.selectAll(".colorBar").each(function(d) {
          d3.select(this).style("border-color", "#000000");});
        d3.select(this).style("border-color", "#ffffff");
        var styleType = (thisGraph.shapeSelected === "noBorder") ? "fill" : "stroke";
        d3.select("#" + thisGraph.shapeSelected + "Selection")
          .style(styleType, thisGraph.clr);
        var selectedEdgeStyleID = (thisGraph.edgeStyle === "solid")
                                ? "#solidEdgeSelection" : "#dashedEdgeSelection";
        d3.select(selectedEdgeStyleID).style("stroke", thisGraph.clr)
          .style("marker-end", function(d) {
            return "url(#end-arrow" + thisGraph.clr.substr(1) + ")";
        });
      });

    // Set initial color selection to black:
    d3.select("#clr000000").style("border-color", "#ffffff");

    // Add shape selection:
    d3.select("#toolbox").insert("div", ":first-child")
      .attr("id", "shapeSelectionDiv");
    d3.select("#shapeSelectionDiv").append("svg")
      .attr("id", "shapeSelectionSvg")
      .attr("width", thisGraph.sssw)
      .attr("height", thisGraph.sssh)
      // Hack: doubling xmlns: so it doesn't disappear once in the DOM
      .attr({"xmlns": "http://www.w3.org/2000/svg",
          "xmlns:xmlns:xlink": "http://www.w3.org/1999/xlink",
          version: "1.1"
      });

    var selectShape = function(selectedElt, shapeSelection) {
      d3.select("#circleSelection").style("stroke", thisGraph.consts.unselectedStyleColor)
        .classed("sel", false).classed("unsel", true);
      d3.select("#rectangleSelection").style("stroke", thisGraph.consts.unselectedStyleColor)
	.classed("sel", false).classed("unsel", true);
      d3.select("#diamondSelection").style("stroke", thisGraph.consts.unselectedStyleColor)
	.classed("sel", false).classed("unsel", true);
      d3.select("#ellipseSelection").style("stroke", thisGraph.consts.unselectedStyleColor)
	.classed("sel", false).classed("unsel", true)
      d3.select("#noBorderSelection").style("fill", thisGraph.consts.unselectedStyleColor);
      var styleType = (shapeSelection === "noBorder") ? "fill" : "stroke";
      selectedElt.style(styleType, thisGraph.clr)
	.classed("sel", true).classed("unsel", false);
      thisGraph.shapeSelected = shapeSelection;
    }

    d3.select("#shapeSelectionSvg").append("circle")
      .attr("id", "circleSelection")
      .attr("r", thisGraph.consts.minCircleRadius)
      .attr("cx", thisGraph.sssw / 2)
      .attr("cy", thisGraph.ssCircleCy)
      .style("stroke", thisGraph.clr)
      .style("stroke-width", 2)
      .classed("sel", true).classed("unsel", false) // Circle initially selected
      .on("click", function(d) { selectShape(d3.select(this), "circle"); });

    d3.select("#shapeSelectionSvg").append("rect")
      .attr("id", "rectangleSelection")
      .attr("width", thisGraph.minRectSide)
      .attr("height", thisGraph.minRectSide)
      .attr("x", thisGraph.sssw / 2.0  - thisGraph.minRectSide + 17)
      .attr("y", thisGraph.consts.ssSquareY)
      .style("stroke", thisGraph.consts.unselectedStyleColor)
      .style("stroke-width", 2)
      .classed("sel", false).classed("unsel", true)
      .on("click", function(d) { selectShape(d3.select(this), "rectangle"); });

    d3.select("#shapeSelectionSvg").append("rect")
      .attr("id", "diamondSelection")
      .attr("width", thisGraph.minRectSide)
      .attr("height", thisGraph.minRectSide)
      .style("stroke", thisGraph.consts.unselectedStyleColor)
      .style("stroke-width", 2)
      .attr("transform", "rotate(45," + thisGraph.minRectSide * 2 + ","
                                      + thisGraph.consts.ssDiamondY + ")")
      .attr("x", thisGraph.sssw / 2.0 + 53)
      .attr("y", thisGraph.consts.ssDiamondY + 62)
      .classed("sel", false).classed("unsel", true)
      .on("click", function(d) { selectShape(d3.select(this), "diamond"); });

    d3.select("#shapeSelectionSvg").append("ellipse")
      .attr("id", "ellipseSelection")
      .attr("cx", thisGraph.sssw / 2)
      .attr("cy", thisGraph.consts.ssEllipseCy)
      .attr("rx", thisGraph.consts.minEllipseRx)
      .attr("ry", thisGraph.consts.minEllipseRy)
      .style("stroke", thisGraph.consts.unselectedStyleColor)
      .style("stroke-width", 2)
      .classed("sel", false).classed("unsel", true)
      .on("click", function(d) {  selectShape(d3.select(this), "ellipse"); });

   d3.select("#shapeSelectionSvg").append("text")
     .attr("id", "noBorderSelection")
     .attr("text-anchor","middle")
     .attr("x", thisGraph.consts.minEllipseRx * 2)
     .attr("y", thisGraph.consts.ssNoBorderXformY + thisGraph.minRectSide * 0.7)
     .classed("unsel", true).classed("sel", false)
     .style("fill", thisGraph.consts.unselectedStyleColor)
     .text("no border")
     .on("click", function(d) {  selectShape(d3.select(this), "noBorder"); });

    // Add edge style selection:
    d3.select("#toolbox").insert("div", ":first-child")
      .attr("id", "edgeStyleSelectionDiv");
    d3.select("#edgeStyleSelectionDiv").append("svg")
      .attr("id", "edgeStyleSelectionSvg")
      .attr("width", "93px")
      .attr("height", "30px")
      // Hack: doubling xmlns: so it doesn't disappear once in the DOM
      .attr({"xmlns": "http://www.w3.org/2000/svg",
        "xmlns:xmlns:xlink": "http://www.w3.org/1999/xlink",
        version: "1.1"
      });

    // Add these rects beneath and around selection edges to make it easier to select:
    d3.select("#edgeStyleSelectionSvg").selectAll(".edgeStyleRect")
      .data([{"id": "solidEdgeRect", "y": 0}, 
             {"id": "dashedEdgeRect", "y": thisGraph.consts.esDashedEdgeRectY}])
      .enter().append("rect")
        .attr("id", function (d) { return d.id; })
        .classed("edgeStyleRect", true)
        .style("opacity", 0.2)
        .attr("x", 0)
        .attr("y", function(d) { return d.y; })
        .attr("width", thisGraph.sssw)
        .attr("height", "15px");

    // Set up the markers for edgeStyleSelection:
    var toolDefs = d3.select("#edgeStyleSelectionSvg").selectAll("marker")
      .data([{"id": "selectedEdgeArrowHead", "color": thisGraph.clr},
             {"id": "unselectedEdgeArrowHead", "color": thisGraph.consts.unselectedStyleColor}])
      .enter().append("marker")
        .attr("id", function(d) { return d.id; })
        .attr("viewBox", "0 -5 10 10")
        .attr("markerWidth", 3.75)
        .attr("markerHeight", 3.75)
        .attr("orient", "auto")
        .attr("fill", function(d) { return d.color; })
        .attr("stroke", function(d) { return d.color; })
        .append("svg:path")
          .style("stroke-linejoin", "miter")
          .attr("d", "M0,-5L10,0L0,5");

    d3.select("#selectedEdgeArrowHead")
      .on("click", function() {
        thisGraph.selectEdgeStyle(thisGraph.clr, "#solidEdgeSelection", "#dashedEdgeSelection");
      });
    d3.select("#unselectedEdgeArrowHead")
      .on("click", function() {
        thisGraph.selectEdgeStyle(thisGraph.clr, "#dashedEdgeSelection", "#solidEdgeSelection");
      });

    // Create the edge style selection sample edges:
    d3.select("#edgeStyleSelectionSvg").selectAll(".styleSelectionLine")
      .data([{"id": "solid", "marker": "#", "stroke": "#000000", "y": "7.5", "other": "dashed",
              "dasharray": "none"},
             {"id": "dashed", "marker": "#un", "stroke": thisGraph.unselectedStyleColor,
              "y": "23.5", "other": "solid", "dasharray": "10, 2"}])
      .enter().append("line")
        .classed("styleSelectionLine", true)
	.attr("id", function(d) { return d.id + "EdgeSelection"; })
	.style("marker-end", function(d) { return "url(" + d.marker + "#selectedEdgeArrowHead"; })
	.style("stroke", function(d) { return d.stroke; })
	.style("stroke-width", 3)
        .style("stroke-dasharray", function(d) { return d.dasharray; })
	.attr("x1", thisGraph.esEdgeX1)
	.attr("y1", function(d) { return d.y; })
	.attr("x2", 4 * thisGraph.sssw / 5)
	.attr("y2", function(d) { return d.y; })
	.on("click", function(d) {
	  thisGraph.selectEdgeStyle(thisGraph.clr, "#" + d.id + "EdgeSelection",
                                                   "#" + d.other + "EdgeSelection");
	});

    // Hack to make sure the arrowhead on the initially selected solid selection edge shows up in
    // Chrome and IE:
    thisGraph.selectEdgeStyle(thisGraph.clr, "#solidEdgeSelection", "#dashedEdgeSelection");
    
    var onMouseOverEdgeStyle = function(selectionId) {
      d3.select(selectionId)
        .attr("opacity", 1)
        .attr("cursor", "pointer")
        .attr("stroke", "#000000");
    };
      
    d3.select("#solidEdgeRect")
      .on("mouseover", function() { onMouseOverEdgeStyle("#solidEdgeSelection"); })
      .on("click", function() {
        thisGraph.selectEdgeStyle(thisGraph.clr, "#solidEdgeSelection", "#dashedEdgeSelection");
      });

    d3.select("#dashedEdgeRect")
      .on("mouseover", function() { onMouseOverEdgeStyle("#dashedEdgeSelection"); })
      .on("click", function() {
        thisGraph.selectEdgeStyle(thisGraph.clr, "#dashedEdgeSelection", "#solidEdgeSelection");
      });
  }


  Graphmaker.prototype.setIdCt = function(idct) {
    this.idct = idct;
  }


  Graphmaker.prototype.getBiggestNodeID = function() {
    var currMax = 0;
    for (var i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].id > currMax) {
        currMax = this.nodes[i].id;
      }
    }
    return currMax;
  }


  // Returns an array of hex color values:
  Graphmaker.prototype.colorChoices = function() {
    var nColors = 12;
    var colorArray = [];
    for (var i = 0; i < (nColors - 1); i++) { // That last almost-red is useless
      var hue = (360 / nColors) * i;
      var currentColor = "hsl(" + hue + ", 100%, 37%)";
      var currentRgb = d3.rgb(currentColor).toString();
      colorArray.push(currentRgb.substr(1)); // Lop off the "#"
    }
    colorArray.push("000000"); // Include black
    return colorArray;
  }


  // Solid or dashed edge?
  Graphmaker.prototype.selectEdgeStyle = function(clr, selectedID, deselectedID) {
    d3.select(selectedID)
      .style("marker-end", function(d) {
         return "url(#end-arrow" + clr.substr(1) + ")";
      })
      .style("stroke", this.clr)
      .classed("sel", true)
      .classed("unsel", false);
    d3.select(deselectedID)
      .style("marker-end", "url(#unselectedEdgeArrowHead)")
      .style("stroke", this.consts.unselectedStyleColor)
      .classed("unsel", true)
      .classed("sel", false);
    this.edgeStyle = (selectedID === "#solidEdgeSelection") ? "solid" : "dashed";
  }


  Graphmaker.prototype.dragmove = function(d) {
    var thisGraph = this;
    if (thisGraph.state.shiftNodeDrag) {
      thisGraph.dragLine.attr("d", "M" + d.x + "," + d.y + "L" + d3.mouse(thisGraph.svgG.node())[0]
          + "," + d3.mouse(this.svgG.node())[1]);
    } else {
      d.x += d3.event.dx;
      d.y +=  d3.event.dy;
      thisGraph.updateGraph();
    }
  };


  Graphmaker.prototype.deleteGraph = function(skipPrompt) {
    var thisGraph = this,
        doDelete = true;
    if (!skipPrompt) {
      doDelete = window.confirm("Press OK to delete this graph");
    }
    if(doDelete) {
      thisGraph.nodes = [];
      thisGraph.links = [];
      thisGraph.hideCirclesOfCare();
      thisGraph.updateGraph();
    }
  };


  // Select all text in element: taken from http://stackoverflow.com/questions/6139107/
  // programatically-select-text-in-a-contenteditable-html-element 
  Graphmaker.prototype.selectElementContents = function(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };


  // Set shape size and position, to stored value[s] if they exist, or else to fit text.
  Graphmaker.prototype.setShapeSizeAndPosition = function(gEl, el, d) {
    var thisGraph = this;
    var textSize = el.node().getBBox();
    var rectWidth = Math.max(textSize.width, thisGraph.minRectSide);
    var rectHeight = Math.max(textSize.height, thisGraph.minRectSide);
    var maxTextDim = Math.max(textSize.width, textSize.height);

    gEl.select("circle")
       .attr("r", function(d) {
         return d.r ? d.r : Math.max(maxTextDim / 2 + 8, thisGraph.consts.minCircleRadius);
       });
    gEl.select(".rectangle, .noBorder")
       .attr("width", function(d) {
         return d.width ? d.width : rectWidth + 6;
       })
       .attr("height", function(d) {
         return d.width ? d.height : rectHeight + 4; // Assume undefined d.width when want shrinkwrap
       })
       .attr("x", function(d) { // Don't check for d.x: that's there anyway
         return d.width ? -d.width / 2 : -rectWidth / 2 - 3;
       })
       .attr("y", function(d) {
         return d.width ? -d.height / 2 - 4 : -rectHeight / 2 - 4;
       });
    gEl.select(".diamond")
       .attr("d", function(d) {
         var dim = d.dim ? d.dim : Math.max(maxTextDim * 1.6, thisGraph.consts.minDiamondDim);
         return "M " + dim / 2 + " 0 L " + dim + " " + dim / 2 + " L " + dim / 2 + " " + dim
           + " L 0 " + dim / 2 + " Z";
       })
       .attr("transform", function (d) {
         var dim = d.dim ? d.dim : Math.max(maxTextDim * 1.6, thisGraph.consts.minDiamondDim);
         return "translate(-" + dim / 2 + ",-" + dim /2 + ")";
       });
    gEl.select("ellipse")
       .attr("rx", function(d) {
         return d.rx ? d.rx : Math.max(textSize.width / 2 + 20, thisGraph.consts.minEllipseRx);
       })
       .attr("ry", function(d) {
         return d.ry ? d.ry : Math.max(textSize.height / 2 + 17, thisGraph.consts.minEllipseRy);
       });
  };


  Graphmaker.prototype.storeShapeSize = function(gEl, d) {
    //if (!gEl[0][0].__data__.shape) return; // Not for edges

    switch (gEl[0][0].__data__.shape) {
      case "rectangle":
      case "noBorder":
        d.width = gEl.select("rect").attr("width"); // Store for computeRectangleBoundary(...)
        d.height = gEl.select("rect").attr("height");
        break;
      case "diamond":
        var pathArray = gEl.select("path").attr("d").split(" ");
        d.dim = parseFloat(pathArray[4], 10);
        d.boundary = d.dim / 2 + 16;
        break;
      case "ellipse":
        d.rx = gEl.select("ellipse").attr("rx"); // Store for computeEllipseBoundary(...)
        d.ry = gEl.select("ellipse").attr("ry");
        break;
      case "circle":
        d.r = gEl.select("circle").attr("r");
        d.boundary = parseFloat(d.r) + 16;
        break;
      default: // May be an edge, in which case boundary is not applicable.
        break;
    }
  };


  // Insert svg line breaks: based on http://stackoverflow.com/questions/13241475/
  // how-do-i-include-newlines-in-labels-in-d3-charts 
  //
  // Now also shrinkwraps shapes to hold all the text when desired.
  //
  // Now also being called on edge text.
  //
  // TODO: refactor.
  Graphmaker.prototype.insertTextLineBreaks = function (gEl, d) {
    var thisGraph = this;
    var words = (d.name) ? d.name.split(/\s+/g) : [""];
    var nwords = words.length;

    // Create lines of text from single words:
    var phrases = [];
    var wordIx = 0;
    var currPhrase = "";
    var maxChars = ((gEl[0][0].__data__.shape === "ellipse")  || (gEl[0][0].__data__.source))
                 ? 25 : this.maxCharsPerLine;

    while (wordIx < nwords) {
      if (words[wordIx].length >= maxChars) {
        phrases.push(words[wordIx++]);
      } else {
        while ((wordIx < nwords)
          && ((currPhrase.length + words[wordIx].length) < maxChars)) {
          currPhrase +=  words[wordIx++];
          if ((wordIx < nwords)
            && ((currPhrase.length + words[wordIx].length) < maxChars)) {
            currPhrase += " ";
          }
        }
        phrases.push(currPhrase);
      }
      currPhrase = "";
    }

    var nPhrases = phrases.length;
    var el = null;
    var tLen = [0]; // Seed the array with a harmless 0 so we don't try to access element at -1
    var baselineAlignment = "middle";

    if (d.source) { // ...then it's an edge: add shadow text for legibility:
      el = gEl.append("text")
	      .attr("text-anchor","left")
	      .attr("alignment-baseline", baselineAlignment)
	      .attr("text-decoration", function(d) {
		return d.url ? "underline" : "none"; })
	      .style("font-weight", function(d) {
		return d.url ? this.boldFontWeight: "none"; })
	      .style("stroke", "rgb(248, 248, 248)")
	      .style("stroke-width", "3px")
	      .attr("dy",  function(d) {
		return "-" + (nPhrases - 1) * 6;
	    });
      el.selectAll("tspan")
        .data(phrases)
        .enter().append("tspan")
          .text(function(d) { return d; })
          .attr("dx", function(d, i) {
            tLen.push(this.getComputedTextLength());
            // TODO: fix edge text position when source or target shape is very large (needs to be
            // centered from shape borders, not just shape centers).
            return -(tLen[i] + tLen[i + 1]) / 2;
          })
          .attr("dy", function(d, i) { return (i > 0) ? 12 : null; });
    }

    el = gEl.append("text")
	    .classed("foregroundText", "true")
	    .attr("text-anchor","left")
	    .attr("alignment-baseline", baselineAlignment)
	    .attr("text-decoration", function(d) {
	      return d.url ? "underline" : "none"; })
	    .style("font-weight", function(d) {
	      return d.url ? this.boldFontWeight: "none"; })
	    .style("fill", gEl[0][0].__data__.color)
	    .attr("dy",  function(d) {
	      return "-" + (nPhrases - 1) * 6;
	    });
    el.selectAll("tspan")
      .data(phrases)
      .enter().append("tspan")
        .text(function(d) { return d; })
        .attr("dy", function(d, i) { 
          return (i > 0) ? 12 : null; 
        });

    if (d.source) { // it's an edge
      el.selectAll("tspan")
        .attr("dx", function(d, i) {
          return -(tLen[i] + tLen[i + 1]) / 2;
        });
    } else { // it's a shape
      el.selectAll("tspan").attr("text-anchor","middle").attr("dx", null).attr("x", 0);
      thisGraph.setShapeSizeAndPosition(gEl, el, d);
      thisGraph.storeShapeSize(gEl, d);
    }
  }; // end insertTextLineBreaks


  // Remove links associated with a node
  Graphmaker.prototype.spliceLinksForNode = function(node) {
    var thisGraph = this,
        toSplice = thisGraph.links.filter(function(l) {
      return (l.source === node || l.target === node);
    });
    toSplice.map(function(l) {
      thisGraph.links.splice(thisGraph.links.indexOf(l), 1);
    });
  };


  // Includes setting selected edge to selected edge color.
  Graphmaker.prototype.replaceSelectEdge = function(d3Path, edgeData) {
    if (d3.event.shiftKey) return;
    var thisGraph = this;
    d3Path.classed(thisGraph.consts.selectedClass, true);
    d3Path.select("path")
	  .style("stroke", thisGraph.consts.selectedColor)
	  .style("marker-end", "url(#selected-end-arrow)");
    d3Path.select(".foregroundText")
	  .style("fill", thisGraph.consts.selectedColor)
    if (thisGraph.state.selectedEdge) {
      thisGraph.removeSelectFromEdge();
    }
    thisGraph.state.selectedEdge = edgeData;
  };


  Graphmaker.prototype.replaceSelectNode = function(d3Node, nodeData) {
    var thisGraph = this;
    d3Node.classed(this.consts.selectedClass, true);
    if (thisGraph.state.selectedNode) {
      thisGraph.removeSelectFromNode();
    }
    thisGraph.state.selectedNode = nodeData;
  };

 
  Graphmaker.prototype.removeSelectFromNode = function() {
    var thisGraph = this;
    thisGraph.shapeGroups.filter(function(cd) {
      return cd.id === thisGraph.state.selectedNode.id;
    }).classed(thisGraph.consts.selectedClass, false);
    thisGraph.state.selectedNode = null;
  };

 
  // Includes setting edge color back to its unselected value.
  Graphmaker.prototype.removeSelectFromEdge = function() {
    var thisGraph = this;
    var deselectedEdgeGroup = thisGraph.edgeGroups.filter(function(cd) {
      return cd === thisGraph.state.selectedEdge;
    }).classed(thisGraph.consts.selectedClass, false);

    deselectedEdgeGroup.select("path")
      .style("stroke", thisGraph.state.selectedEdge.color)
      .style("marker-end", function(d) {
        var clr = d.color ? d.color.substr(1) : d.target.color.substr(1);
        return "url(#end-arrow" + clr + ")";
      });
    deselectedEdgeGroup.select(".foregroundText")
      .style("fill", thisGraph.state.selectedEdge.color);
    thisGraph.state.selectedEdge = null;
  };

 
  Graphmaker.prototype.pathMouseDown = function(d3path, d) {
    var thisGraph = this,
        state = thisGraph.state;
    d3.event.stopPropagation();
    state.mouseDownLink = d;

    if (state.selectedNode) {
      thisGraph.removeSelectFromNode();
    }

    var prevEdge = state.selectedEdge;
    if (!prevEdge || prevEdge !== d) {
      thisGraph.replaceSelectEdge(d3path, d);
    } else {
      thisGraph.removeSelectFromEdge();
    }
  };


  // Mousedown on node
  Graphmaker.prototype.shapeMouseDown = function(d3node, d) {
    var thisGraph = this,
        state = thisGraph.state;
    d3.event.stopPropagation();
    state.mouseDownNode = d;
    if (d3.event.shiftKey) {
      state.shiftNodeDrag = d3.event.shiftKey;
      thisGraph.dragLine.classed("hidden", false) // Reposition dragged directed edge
        .attr("d", "M" + d.x + "," + d.y + "L" + d.x + "," + d.y);
    } 
  };
 

  // Place editable text on node or edge in place of svg text
  //
  // Note: see bug report https://code.google.com/p/chromium/issues/detail?id=304567 "svg
  // foreignObject with contentEditable=true editing/placement inconsistency" for possible
  // explanation of editable text positioning difficulties.
  Graphmaker.prototype.changeElementText = function(d3element, d) {
    var thisGraph= this,
        consts = thisGraph.consts,
        htmlEl = d3element.node();
    d3element.selectAll("text").remove();
    var nodeBCR = htmlEl.getBoundingClientRect(),
        curScale = nodeBCR.width / (consts.minCircleRadius * 2),
        placePad  =  5 * curScale,
        //useHW = curScale > 1 ? nodeBCR.width * 0.71 : consts.minCircleRadius * 2.84;
        useHW = curScale > 1 ? nodeBCR.width * 1.71 : consts.minCircleRadius * 4.84;

    // Replace with editable content text:
    var d3txt = thisGraph.svg.selectAll("foreignObject")
	.data([d])
      .enter().append("foreignObject")
	//.attr("x", nodeBCR.left + placePad)
        //.attr("y", nodeBCR.top + placePad)
	.attr("x", nodeBCR.left + nodeBCR.width / 2)
        .attr("y", nodeBCR.top + nodeBCR.height / 2)
        .attr("height", 2 * useHW)
        .attr("width", useHW)
      .append("xhtml:p")
        .attr("id", consts.activeEditId)
        .attr("contentEditable", "true")
        .text(d.name)
      .on("mousedown", function(d) {
	d3.event.stopPropagation();
      })
      .on("keydown", function(d) {
	d3.event.stopPropagation();
	if (d3.event.keyCode === consts.ENTER_KEY && !d3.event.shiftKey) {
	  this.blur();
	}
      })
      .on("blur", function(d) {
	d.name = this.textContent.trim(); // Remove whitespace fore and aft
        d.r = d.width = d.height = d.dim = d.rx = d.ry = undefined; // Force shape shrinkwrap
	thisGraph.insertTextLineBreaks(d3element, d);
	d3.select(this.parentElement).remove();
        thisGraph.updateGraph(); 
      });
    return d3txt;
  };

 
  // Mouseup on nodes
  Graphmaker.prototype.shapeMouseUp = function(d3node, d) {
    var thisGraph = this,
        state = thisGraph.state,
        consts = thisGraph.consts;

    // Reset the states
    state.shiftNodeDrag = false;
    state.justDragged = false;
    d3node.classed(consts.connectClass, false);

    var mouseDownNode = state.mouseDownNode;

    if (!mouseDownNode) return;

    thisGraph.dragLine.classed("hidden", true);

    if (mouseDownNode !== d) { // We're in a different node: create new edge and add to graph
      var newEdge = {source: mouseDownNode,
                     target: d,
                     style: thisGraph.edgeStyle,
                     color: thisGraph.clr, 
                     name: consts.defaultEdgeText + thisGraph.edgeNum++};
      var filtRes = thisGraph.edgeGroups.filter(function(d) {
        if (d.source === newEdge.target && d.target === newEdge.source) {
          thisGraph.links.splice(thisGraph.links.indexOf(d), 1);
        }
        return d.source === newEdge.source && d.target === newEdge.target;
      });
      if (!filtRes[0].length) {
        thisGraph.links.push(newEdge);
        thisGraph.updateGraph();
        // Todo: adapt the following code block for edges.
        /*
        var d3txt = thisGraph.changeElementText(thisGraph.links.filter(function(dval) {
          return dval.name === newEdge.name;
        }), newEdge);
        var txtNode = d3txt.node();
        thisGraph.selectElementContents(txtNode);
        txtNode.focus();
        */
      }
    } else { // We're in the same node
      if (state.justDragged) { // Dragged, not clicked
        state.justDragged = false;
      } else { // Clicked, not dragged
        if (d3.event.shiftKey) { // Shift-clicked node: edit text content
          var d3txt = thisGraph.changeElementText(d3node, d);
          var txtNode = d3txt.node();
          thisGraph.selectElementContents(txtNode);
          txtNode.focus();
        } else { 
          if (state.selectedEdge) {
            thisGraph.removeSelectFromEdge();
          }
          var prevNode = state.selectedNode;

          if (!prevNode || prevNode.id !== d.id) {
            thisGraph.replaceSelectNode(d3node, d);
          } else {
            thisGraph.removeSelectFromNode();
          }
        }
      }
    }
    state.mouseDownNode = null;
  }; // end of shapeMouseUp

 
  // Mousedown on main svg
  Graphmaker.prototype.svgMouseDown = function() {
    this.state.graphMouseDown = true;
  };
 

  // Mouseup on main svg
  Graphmaker.prototype.svgMouseUp = function() {
    var thisGraph = this,
        state = thisGraph.state;
    
    // If options menu is open, close it:
    d3.select("#menuDiv") .classed("menu", false).classed("menuHidden", true);

    if (state.justScaleTransGraph) { // Dragged not clicked
      state.justScaleTransGraph = false;
    } else if (state.graphMouseDown && d3.event.shiftKey) { // Clicked not dragged from svg
      var xycoords = d3.mouse(thisGraph.svgG.node());

      var d = {id: thisGraph.idct,
               name: thisGraph.consts.defaultNodeText + thisGraph.idct++,
               x: xycoords[0],
               y: xycoords[1],
               color: thisGraph.clr,
               shape: thisGraph.shapeSelected};
      thisGraph.nodes.push(d);
      thisGraph.updateGraph();

      // Make text immediately editable
      var d3txt = thisGraph.changeElementText(thisGraph.shapeGroups.filter(function(dval) {
        return dval.id === d.id;
      }), d),
          txtNode = d3txt.node();
      thisGraph.selectElementContents(txtNode);
      txtNode.focus();
    } else if (state.shiftNodeDrag) { // Dragged from node
      state.shiftNodeDrag = false;
      thisGraph.dragLine.classed("hidden", true);
    } 
    state.graphMouseDown = false;
  };

 
  // Keydown on main svg
  Graphmaker.prototype.svgKeyDown = function() {
    var thisGraph = this,
        state = thisGraph.state,
        consts = thisGraph.consts;

    // Make sure repeated key presses don't register for each keydown
    if(state.lastKeyDown !== -1) return;

    state.lastKeyDown = d3.event.keyCode;
    var selectedNode = state.selectedNode,
        selectedEdge = state.selectedEdge;


    switch (d3.event.keyCode) {
    case consts.BACKSPACE_KEY:
    case consts.DELETE_KEY:
      d3.event.preventDefault();
      if (selectedNode) {
        thisGraph.nodes.splice(thisGraph.nodes.indexOf(selectedNode), 1);
        thisGraph.spliceLinksForNode(selectedNode);
        state.selectedNode = null;
        thisGraph.updateGraph();
      } else if (selectedEdge) {
        thisGraph.links.splice(thisGraph.links.indexOf(selectedEdge), 1);
        state.selectedEdge = null;
        thisGraph.updateGraph();
      }
      break;
    }
  };
 

  Graphmaker.prototype.svgKeyUp = function() {
    this.state.lastKeyDown = -1;
  };


  // Returns new end point p2'. Arg "change" is in pixels. Negative "change" shortens the line.
  Graphmaker.prototype.changeLineLength = function(x1, y1, x2, y2, change) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var length = Math.sqrt(dx * dx + dy * dy);
    if (length > 0) {
      dx /= length;
      dy /= length;
    }
    dx *= (length + change);
    dy *= (length + change);
    return {"x": x1 + dx, "y": y1 + dy};
  }
 

  Graphmaker.prototype.updateExistingPaths = function() {
    var thisGraph = this;
    thisGraph.edgeGroups = thisGraph.edgeGroups.data(thisGraph.links, function(d) {
      return String(d.source.id) + "+" + String(d.target.id);
    });
    thisGraph.edgeGroups.classed(thisGraph.consts.selectedClass, function(d) {
           return d === thisGraph.state.selectedEdge;
         })
         .attr("d",  function(d) {
           return thisGraph.setPath(d);
         });
    return thisGraph.edgeGroups;
  }


  // Call to propagate changes to graph
  Graphmaker.prototype.updateGraph = function() {
    var thisGraph = this,
        consts = thisGraph.consts,
        state = thisGraph.state;

    // Update existing nodes
    thisGraph.shapeGroups = thisGraph.shapeGroups.data(thisGraph.nodes, function(d) {
      return d.id;
    });
    thisGraph.shapeGroups.attr("transform", function(d) {
      return "translate(" + d.x + "," + d.y + ")";
    });

    // Add new nodes
    var newShapeGs = thisGraph.shapeGroups.enter().append("g")

    newShapeGs.classed(consts.shapeGClass, true)
      .attr("transform", function(d) { 
        return "translate(" + d.x + "," + d.y + ")";
      })
      .on("mouseover", function(d) {
        if (state.shiftNodeDrag) {
          d3.select(this).classed(consts.connectClass, true);
        }
      })
      .on("mouseout", function(d) {
        d3.select(this).classed(consts.connectClass, false);
      })
      .on("mousedown", function(d) {
        thisGraph.shapeMouseDown.call(thisGraph, d3.select(this), d);
      })
      .on("mouseup", function(d) {
        if ((d3.event.ctrlKey) && (d.url)) {
          window.open(d.url, d.name);
        } else if (d3.event.altKey) {
          var defaultUrl = d.url ? d.url : "";
          var newUrl = prompt("Enter url for this node: ", defaultUrl);
          if (newUrl) {
            d.url = newUrl;
            d3.select(this).select("text")
              .style("font-weight", thisGraph.boldFontWeight)
              .style("text-decoration", "underline");
            thisGraph.updateGraph();
          } 
        } else {
          thisGraph.shapeMouseUp.call(thisGraph, d3.select(this), d);
        }
      })
      .call(thisGraph.drag);

    //  Create the new shapes but don't add them yet:
    var shapeElts = [];
    for (var i = 0; i < thisGraph.nodes.length; i++) {
      var shape;
      switch (thisGraph.nodes[i].shape) {
        case "rectangle":
        case "noBorder":
          shape = "rect";
          break;
        case "diamond":
          shape = "path";
          break;
        default: // circle and ellipse
          shape = thisGraph.nodes[i].shape;
          break;
      }
      var shapeElement = document.createElementNS("http://www.w3.org/2000/svg", shape);
      shapeElts.push(shapeElement);
    }

    // Add the newly created shapes to the graph, assigning attributes common to all:
    newShapeGs.append(function(d, i) { return shapeElts[i]; })
	      //.attr("class", "shape")
	      .attr("class", function(d) { return "shape " + d.shape; })
              .style("stroke", function(d) { return d.color; })
              .style("stroke-width", function(d) { return (d.shape === "noBorder") ? 0 : 2; });
    newShapeGs.each(function(d) {
      thisGraph.insertTextLineBreaks(d3.select(this), d);
    });

    // Remove old nodes
    thisGraph.shapeGroups.exit().remove();

    var edgeGroups = thisGraph.updateExistingPaths();

    var restoreEdgeColor = function(edgeGroup, d) {
      d3.select(edgeGroup).selectAll("path")
	.style("stroke", function(d) { return d.color; })
	.style("marker-end", function(d) {
	  return "url(#end-arrow" + d.color.substr(1) + ")";
	});
    };

    // Add new paths
    var newPathGs = edgeGroups.enter().append("g");
    newPathGs.classed(thisGraph.consts.pathGClass, "true")
      .on("mousedown", function(d) {
	thisGraph.pathMouseDown.call(thisGraph, d3.select(this), d);
      })
      .on("mouseup", function(d) {
	if (d3.event.shiftKey) {
          restoreEdgeColor(this, d);
	  var d3txt = thisGraph.changeElementText(d3.select(this), d);
	  var txtNode = d3txt.node();
	  thisGraph.selectElementContents(txtNode);
	  txtNode.focus();
	}
	state.mouseDownLink = null;
      })
      .on("mouseover", function(d) { // Hover color iff not (selected, new edge or inside shape):
        if ((d3.select(this).selectAll("path").style("stroke") !== thisGraph.consts.selectedColor)
            && (!thisGraph.state.shiftNodeDrag) && (!thisGraph.state.justDragged)) {
	  d3.select(this).selectAll("path").style("stroke", thisGraph.consts.hoverColor)
            .style("marker-end", "url(#hover-end-arrow)");
	  d3.select(this).selectAll("text").style("fill", thisGraph.consts.hoverColor);
        }
      })
      .on("mouseout", function(d) { // If selected go back to selectedColor:
      // Note: this replaces "mouseleave", which was not getting called in Chrome when the shiftKey
      // was down.
        if (((thisGraph.state.selectedEdge)) && (thisGraph.state.selectedEdge.name === d.name)) {
	  d3.select(this).selectAll("path").style("stroke", thisGraph.consts.selectedColor);
	  d3.select(this).selectAll("text").style("fill", thisGraph.consts.selectedColor);
        } else { // Not selected: reapply edge color, including edge text:
          restoreEdgeColor(this, d);
	  d3.select(this).selectAll("text").style("fill", function(d) { return d.color; });
        }
      })
      .append("path")
	.style("marker-end", function(d) {
	  var clr = d.color ? d.color.substr(1) : d.target.color.substr(1);
	  return "url(#end-arrow" + clr + ")";
        })
	.classed("link", true)
	.style("stroke", function(d) { return d.color ? d.color : d.target.color; })
	.style("stroke-dasharray", function (d) {
	  return (d.style === "dashed") ? "10, 2" : "none";
        });
     newPathGs.each(function(d) {
       thisGraph.insertTextLineBreaks(d3.select(this), d);
     });
    var pathGs = d3.selectAll(".pathG");
    pathGs.select("path")
      .attr("d", function(edge) {
        return thisGraph.setPath(edge);
      });
  
    // Check to make sure that there aren't already text objects appended (they would be
    // pathGs[0][i].childNodes[1] and [2], where the 0th element is expected to be the path) before
    // appending text.
    //
    // Note that there are two text elements being appended. The first is background shadow
    // to ensure that the text is visible where it overlays its edge.
    for (var i = 0; i < pathGs[0].length; i++) {         // For each pathG...
      if (pathGs[0][i].childNodes.length < 3) {          // ...if there's no text yet...
        var data = [{"class": "shadowText", "stroke-width": "4px"},
                    {"class": "foregroundText", "stroke-width": "0px"}];
        d3.select(pathGs[0][i]).selectAll("text")
          .data(data)
          .enter().append("text")                        // ...then append it.
            .attr("class", function(d) { return d.class; })
	    .attr("text-anchor","middle")
	    .text( function(d) { return d.name; })
	    .attr("x", function(d) { return (d.source.x + d.target.x) / 2; })
	    .attr("y", function(d) { return (d.source.y + d.target.y) / 2; })
	    .style("stroke", "rgb(248, 248, 248)")
	    .style("stroke-width", function(d) { return d.stroke-width; })
	    .style("fill", function(d) {
	      return d.color;
	    });
      }
    }
    d3.selectAll(".pathG").selectAll("text")
      .attr("x", function(d) { return (d.source.x + d.target.x) / 2; }) 
      .attr("y", function(d) { return (d.source.y + d.target.y) / 2; }); 

    // Remove old links
    edgeGroups.exit().remove();
  }; // end updateGraph


  Graphmaker.prototype.zoomed = function() {
    this.state.justScaleTransGraph = true;
    d3.select("." + this.consts.graphClass)
      .attr("transform", "translate(" + d3.event.translate + ") scale(" + d3.event.scale + ")");
  };


  Graphmaker.prototype.updateWindow = function(svg) {
    var docEl = document.documentElement,
        bodyEl = document.getElementsByTagName("body")[0];
    var x = window.innerWidth || docEl.clientWidth || bodyEl.clientWidth;
    var y = window.innerHeight|| docEl.clientHeight|| bodyEl.clientHeight;
    svg.attr("width", x).attr("height", y);
  };


  // http://warpycode.wordpress.com/2011/01/21/calculating-the-distance-to-the-edge-of-an-ellipse/
  // Angle theta is measured from the -y axis (recalling that +y is down) clockwise.
  Graphmaker.prototype.computeEllipseBoundary = function(edge) {
    var dx = edge.target.x - edge.source.x;
    var dy = edge.target.y - edge.source.y;
    var rx  = edge.target.rx,
        ry  = edge.target.ry;
    var h = Math.sqrt(dx * dx + dy * dy);
    var s = dx / h; // sin theta
    var c = dy / h; // cos theta
    var length = Math.sqrt(1 / ((s / rx) * (s / rx) + (c / ry) * (c / ry)));
    var offset = 18;
    return length + offset;
  };


  // Angle theta is measured from -y axis (up) clockwise.
  Graphmaker.prototype.computeRectangleBoundary = function(edge) {
    var dx = Math.abs(edge.source.x - edge.target.x);
    var dy = Math.abs(edge.target.y - edge.source.y);
    var hyp = Math.sqrt(dx * dx + dy * dy);
    var absCosTheta = dy / hyp; // Absolute value of cosine theta
    var w = edge.target.width / 2;
    var h = edge.target.height / 2;
    var transitionCos = h / Math.sqrt(w * w + h * h); // cos of angle where intersect switches sides
    var offset = 22; // Give the arrow a little breathing room
    return ((absCosTheta > transitionCos) ? h * hyp / dy : w * hyp / dx) + offset;
  };


  Graphmaker.prototype.setPath = function(edge) {
    var boundary = 16; // Initialize to default number of pixels padding for circle, diamond.
    switch (edge.target.shape) {
      case "circle":
        if (edge.target.r) boundary += parseFloat(edge.target.r);
        else boundary = edge.target.boundary; // TEMP SAC
        break;
      case ("rectangle"):
      case ("noBorder"):
        boundary = this.computeRectangleBoundary(edge);
        break;
      case "diamond": 
        if (edge.target.dim) boundary += (parseFloat(edge.target.dim) / 2);
        else boundary = edge.target.boundary; // TEMP SAC
        break;
      case "ellipse": 
        boundary = this.computeEllipseBoundary(edge);
        break;
      default:
        alert("setPath(...): unknown shape.");
        break;
    }
    
    var newP2 = this.changeLineLength(edge.source.x, edge.source.y, edge.target.x, edge.target.y,
                                     -boundary);
    return "M" + edge.source.x + "," + edge.source.y + "L" + newP2.x + "," + newP2.y;
  };


  // Draw three concentric circles.
  Graphmaker.prototype.createCirclesOfCare = function() {
    d3.select("#graphG").selectAll(".cOfC")
      .data([75, 300, 500])
      .enter().append("circle")
        .classed({"cOfC": true, "circleHidden": true, "circleOfCare": false})
        .attr("r", function(d) { 
          return d; 
        });
  };


  Graphmaker.prototype.showCirclesOfCare = function(thisGraph) {
    if (!thisGraph.CofCC) {
      thisGraph.CofCC = {"x": d3.select("#graph").node().clientWidth / 2,
		    "y": d3.select("#graph").node().clientHeight / 2};
    }
    d3.selectAll(".circleHidden")
      .classed({"circleHidden": false, "circleOfCare": true})
      .attr("cx", thisGraph.CofCC.x)
      .attr("cy", thisGraph.CofCC.y);

      d3.select("#optionsOption0").text("Hide Circles of Care");
  };


  Graphmaker.prototype.hideCirclesOfCare = function() {
    d3.selectAll(".circleOfCare")
      .classed({"circleHidden": true, "circleOfCare": false})
    d3.select("#optionsOption0").text("Show Circles of Care");
  };


  Graphmaker.prototype.equalizeSelectedShapeSize = function() {
    var thisGraph = this;
    var selectedClassName = "." + this.shapeSelected;
    var selectedShapes = d3.selectAll(selectedClassName);
    var rMax = 0;             // circle
    var wMax = 0, hMax = 0;   // rectangle, noBorder
    var dMax = 0;             // diamond
    var rxMax = 0, ryMax = 0; // ellipse

    selectedShapes.each(function(d, i) {
      var thisShapeElt = d3.select(this);
      switch (d.shape) {
        case "circle":
          rMax = Math.max(rMax, thisShapeElt.attr("r"));
          break;
        case "rectangle":
        case "noBorder":
          wMax = Math.max(wMax, thisShapeElt.attr("width"));
          hMax = Math.max(hMax, thisShapeElt.attr("height"));
          break;
        case "diamond":
          var pathArray = thisShapeElt.attr("d").split(" ");
          var dim = parseFloat(pathArray[4], 10);
          if (!dim) {
            alert("selectedShapes.each() case diamond: dimension NaN.");
          } else {
            dMax = Math.max(dMax, dim);
          }
          break;
        case "ellipse": 
          rxMax = Math.max(rxMax, thisShapeElt.attr("rx"));
          ryMax = Math.max(ryMax, thisShapeElt.attr("ry"));
          break;
        default:
          alert("selectedShapes.each(): unknown shape \"" + d.shape + "\"");
      }
    });

    switch (this.shapeSelected) {
      case "circle":
	selectedShapes.attr("r", rMax);
	break;
      case "rectangle":
      case "noBorder":
	selectedShapes.attr("width", wMax)
                      .attr("height", hMax)
                      .attr("x", -wMax / 2)
                      .attr("y", -hMax / 2 - 4);
	break;
      case "diamond":
        selectedShapes.attr("d", function() {
         return "M " + dMax / 2 + " 0 L " + dMax + " " + dMax / 2 + " L " + dMax / 2 + " " + dMax
                     + " L 0 " + dMax / 2 + " Z";
       })
       .attr("transform", function () { return "translate(-" + dMax / 2 + ",-" + dMax /2 + ")"; });
	break;
      case "ellipse":
	selectedShapes.attr("rx", rxMax).attr("ry", ryMax);
	break;
      default:
        alert("equalizeSelectedShapeSize(): unknown shape \"" + d.shape + "\"");
        break;
    }

    thisGraph.shapeGroups.each(function(d, i) {
      thisGraph.storeShapeSize(d3.select(this), d);
    });
    thisGraph.updateExistingPaths();
    thisGraph.updateGraph();
  };


  Graphmaker.prototype.createOptionsMenu = function() {
    var thisGraph = this;
    var items = [{"name": "Show Circles of Care"},
                 {"name": "Equalize selected shape size"},
                 {"name": "Match shape & graph backgrounds"},
                 {"name": "Font"},
                 {"name": "Edge thickness"},
                 {"name": "Shape border thickness"}
               ];
    var optionsDiv =  d3.select("#graph").insert("div", ":first-child")
      .classed("menuHidden", "true").classed("menu", false)
      .attr("id", "menuDiv")
      .attr("position", "absolute")
      .on("mouseleave", function() {
        d3.select("#menuDiv")
            .classed("menu", false).classed("menuHidden", true);
      });
    d3.select("#menuDiv").append("ul").attr("id", "menuList");
    d3.select("#menuList").selectAll("li")
      .data(items).enter()
      .append("li")
        .attr("id", function(d, i) { return "optionsOption" + i; })
        .text(function(d) { return d.name; })
        .on("mouseup", function(d) {
          d3.select("#menuDiv")
            .classed("menu", false).classed("menuHidden", true);

          switch(d3.select(this).text()) {
            case "Show Circles of Care":
              thisGraph.showCirclesOfCare(thisGraph);
              break;
            case "Hide Circles of Care":
              thisGraph.hideCirclesOfCare();
              break;
            case "Equalize selected shape size":
              thisGraph.equalizeSelectedShapeSize();
              break;
            default:
              alert("\"" + d.name + "\" not implemented.");
          }
        });
  };


  /**** MAIN ****/

  // TODO add user settings
  var settings = {
    appendElSpec: "#graph"
  };

  // Warn the user when leaving
  window.onbeforeunload = function() {
    return "Make sure to save your graph locally before leaving :-)";
  };

  var docEl = document.documentElement,
      bodyEl = document.getElementsByTagName("body")[0];

  var width = window.innerWidth || docEl.clientWidth || bodyEl.clientWidth,
      height =  window.innerHeight|| docEl.clientHeight|| bodyEl.clientHeight;
  
  // Initial node data
  var nodes = [];
  var links = [];


  /** MAIN SVG **/
  var svg = d3.select(settings.appendElSpec).append("svg")
        .attr("width", width)
        .attr("height", height);
  var graph = new Graphmaker(svg, nodes, links);
  graph.setIdCt(0);
  graph.updateGraph();
})(window.d3, window.saveAs, window.Blob);
