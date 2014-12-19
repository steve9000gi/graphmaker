// Build a graph with nodes of several shapes and colors, and connect them with directed edges.
// Save a constructed graph locally as a json file, and open saved graph files.
// Author: Steve Chall, RENCI UNC-CH
// Based on Colorado Reed's https://github.com/cjrd/directed-graph-creator.

document.onload = (function(d3, saveAs, Blob, undefined) {
  "use strict";

  // Define graphcreator object
  var GraphCreator = function(svg, nodes, links) {
    var thisGraph = this;
    thisGraph.idct = 0;
    thisGraph.clr = "#000000";
    thisGraph.edgeStyle = "solid";
    thisGraph.minRectSide = 
      Math.sqrt(Math.PI * thisGraph.consts.minCircleRadius * thisGraph.consts.minCircleRadius);
    thisGraph.shapeSelected = "circle";
    thisGraph.unselected = "#666666";
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

    // Define arrow markers for leading arrow (just while dragging)
    defs.append("svg:marker")
      .attr("id", "mark-end-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("markerWidth", 3.5)
      .attr("markerHeight", 3.5)
      .attr("orient", "auto")
    .append("svg:path")
      .attr("d", "M0,-5L10,0L0,5");

    // Define arrow markers for selected arrow
    defs.append("svg:marker")
      .attr("id", "selected-end-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("markerWidth", 3.5)
      .attr("markerHeight", 3.5)
      .attr("orient", "auto")
      .attr("fill", "rgb(229, 172, 247)")
      .attr("stroke", "none")
    .append("svg:path")
      .attr("d", "M0,-5L10,0L0,5");

    thisGraph.svg = svg;
    thisGraph.svgG = svg.append("g").classed(thisGraph.consts.graphClass, true);
    var svgG = thisGraph.svgG;

    // Displayed when dragging between nodes
    thisGraph.dragLine = svgG.append("svg:path")
      .attr("class", "link dragline hidden")
      .attr("d", function(d) { return "M0,0L0,0"; })
      .style("marker-end", "url(#mark-end-arrow)");

    // Svg nodes and links
    thisGraph.paths = svgG.append("g").selectAll("g");
    thisGraph.shapes = svgG.append("g").selectAll("g");

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
      var blob = new Blob([window.JSON.stringify({"nodes": thisGraph.nodes, "links": saveEdges})], 
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
  }; // end GraphCreator(...)


  GraphCreator.prototype.consts =  {
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
    defaultNodeText: "new node",
    defaultEdgeText: "new edge" 
  };

  /* PROTOTYPE FUNCTIONS */

  // Edge, shape, and color selection, along with a "?" help button, load, save, and delete.
  GraphCreator.prototype.prepareToolbox = function() {
    var thisGraph = this;
    thisGraph.sssw = thisGraph.consts.minCircleRadius * 4 + 23; // Shape Selection Svg Width
    thisGraph.sssh = thisGraph.consts.minCircleRadius * 10; // Shape Selection Svg Height
    thisGraph.ssCircleCy = thisGraph.consts.minCircleRadius * 2 - 16; // ShapeSelectionCircleCy
    thisGraph.ssSquareY = 47; 
    thisGraph.ssDiamondY = 18; 
    thisGraph.ssEllipseCy = 138; 
    thisGraph.ssNoBorderXformY = 163; 
    thisGraph.esDashedEdgeRectY = 20; // EdgeSelection
    thisGraph.esEdgeX1 = thisGraph.sssw / 5 - 20; 

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
    
    // Create color palette:
    d3.select("#toolbox").insert("div", ":first-child")
      .attr("id", "colorPalette");
    d3.select("#colorPalette").selectAll(".colorBar")
        .data(thisGraph.colorChoices)
      .enter().append("div")
        .classed("colorBar", true)
        .attr("id", function(d) { return "clr" + d; })
        .style("background-color", function(d) { return "#" + d; })
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

    // Usage example: .on("click", function(d) { selectShape(d3.select(this), "circle"); });
    var selectShape = function(selectedElt, shapeSelection) {
      d3.select("#circleSelection").style("stroke", thisGraph.unselected)
        .classed("sel", false).classed("unsel", true);
      d3.select("#rectangleSelection").style("stroke", thisGraph.unselected)
	.classed("sel", false).classed("unsel", true);
      d3.select("#diamondSelection").style("stroke", thisGraph.unselected)
	.classed("sel", false).classed("unsel", true);
      d3.select("#ellipseSelection").style("stroke", thisGraph.unselected)
	.classed("sel", false).classed("unsel", true)
      d3.select("#noBorderSelection").style("fill", thisGraph.unselected);
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
      .attr("y", thisGraph.ssSquareY)
      .style("stroke", thisGraph.unselected)
      .style("stroke-width", 2)
      .classed("sel", false).classed("unsel", true)
      .on("click", function(d) { selectShape(d3.select(this), "rectangle"); });

    d3.select("#shapeSelectionSvg").append("rect")
      .attr("id", "diamondSelection")
      .attr("width", thisGraph.minRectSide)
      .attr("height", thisGraph.minRectSide)
      .style("stroke", thisGraph.unselected)
      .style("stroke-width", 2)
      .attr("transform", "rotate(45," + thisGraph.minRectSide * 2 + "," + thisGraph.ssDiamondY
                                      + ")")
      .attr("x", thisGraph.sssw / 2.0 + 53)
      .attr("y", thisGraph.ssDiamondY + 62)
      .classed("sel", false).classed("unsel", true)
      .on("click", function(d) { selectShape(d3.select(this), "diamond"); });

    d3.select("#shapeSelectionSvg").append("ellipse")
      .attr("id", "ellipseSelection")
      .attr("cx", thisGraph.sssw / 2)
      .attr("cy", thisGraph.ssEllipseCy + 18)
      .attr("rx", thisGraph.consts.minEllipseRx)
      .attr("ry", thisGraph.consts.minEllipseRy)
      .style("stroke", thisGraph.unselected)
      .style("stroke-width", 2)
      .classed("sel", false).classed("unsel", true)
      .on("click", function(d) {  selectShape(d3.select(this), "ellipse"); });

   d3.select("#shapeSelectionSvg").append("text")
     .attr("id", "noBorderSelection")
     .attr("text-anchor","middle")
     .attr("x", thisGraph.consts.minEllipseRx * 2)
     .attr("y", thisGraph.ssNoBorderXformY + thisGraph.minRectSide * 0.7)
     .classed("unsel", true).classed("sel", false)
     .style("fill", thisGraph.unselected)
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
             {"id": "dashedEdgeRect", "y": thisGraph.esDashedEdgeRectY}])
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
             {"id": "unselectedEdgeArrowHead", "color": thisGraph.unselected}])
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
    d3.select("#edgeStyleSelectionSvg").append("line") 
      .attr("id", "solidEdgeSelection")
      .style("marker-end", "url(#selectedEdgeArrowHead")
      .style("stroke", "#000000")
      .style("stroke-width", 3)
      .attr("x1", thisGraph.esEdgeX1)
      .attr("y1", "7.5")
      .attr("x2", 4 * thisGraph.sssw / 5)
      .attr("y2", "7.5")
      .on("click", function() { 
        thisGraph.selectEdgeStyle(thisGraph.clr, "#solidEdgeSelection", "#dashedEdgeSelection");
      });

    d3.select("#edgeStyleSelectionSvg").append("line") 
      .attr("id", "dashedEdgeSelection")
      .style("marker-end", "url(#unselectedEdgeArrowHead)")
      .style("stroke", thisGraph.unselected)
      .style("stroke-width", 3)
      .style("stroke-dasharray", "10, 2")
      .attr("x1", thisGraph.esEdgeX1)
      .attr("y1", "22.5")
      .attr("x2", 4* thisGraph.sssw / 5)
      .attr("y2", "22.5")
      .on("click", function() {
        thisGraph.selectEdgeStyle(thisGraph.clr, "#dashedEdgeSelection", "#solidEdgeSelection");
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


  GraphCreator.prototype.setIdCt = function(idct) {
    this.idct = idct;
  }


  GraphCreator.prototype.getBiggestNodeID = function() {
    var currMax = 0;
    for (var i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].id > currMax) {
        currMax = this.nodes[i].id;
      }
    }
    return currMax;
  }


  // Returns an array of hex color values:
  GraphCreator.prototype.colorChoices = function() {
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
  GraphCreator.prototype.selectEdgeStyle = function(clr, selectedID, deselectedID) {
    d3.select(selectedID)
      .style("marker-end", function(d) {
         return "url(#end-arrow" + clr.substr(1) + ")";
      })
      .style("stroke", this.clr)
      .classed("sel", true)
      .classed("unsel", false);
    d3.select(deselectedID)
      .style("marker-end", "url(#unselectedEdgeArrowHead)")
      .style("stroke", this.unselected)
      .classed("unsel", true)
      .classed("sel", false);
    this.edgeStyle = (selectedID === "#solidEdgeSelection") ? "solid" : "dashed";
  }


  GraphCreator.prototype.dragmove = function(d) {
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


  GraphCreator.prototype.deleteGraph = function(skipPrompt) {
    var thisGraph = this,
        doDelete = true;
    if (!skipPrompt) {
      doDelete = window.confirm("Press OK to delete this graph");
    }
    if(doDelete) {
      thisGraph.nodes = [];
      thisGraph.links = [];
      thisGraph.updateGraph();
    }
  };


  // Select all text in element: taken from http://stackoverflow.com/questions/6139107/
  // programatically-select-text-in-a-contenteditable-html-element 
  GraphCreator.prototype.selectElementContents = function(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };


  // Insert svg line breaks: based on http://stackoverflow.com/questions/13241475/
  // how-do-i-include-newlines-in-labels-in-d3-charts 
  //
  // Now also resizes nodes to hold all the text. 2do: refactor.
  // Now also being called on edge text.
  GraphCreator.prototype.insertTextLineBreaks = function (gEl, d) {
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
/*
	 .attr("dx", function(d, i) {
	   return -(tLen[i] + tLen[i + 1]) / 2;
	 })
*/
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
    }

    // Resize and move the nodes so the text aligns and fits:
    var textSize = el.node().getBBox();
    var rectWidth = Math.max(textSize.width, this.minRectSide);
    var rectHeight = Math.max(textSize.height, this.minRectSide);
    var maxTextDim = Math.max(textSize.width, textSize.height);
    var dim = Math.max(maxTextDim * 1.6, this.consts.minDiamondDim);

    gEl.select("circle")
       .attr("r", Math.max(maxTextDim / 2 + 8, this.consts.minCircleRadius));
    gEl.select(".rectangle")
       .attr("width", rectWidth + 6)
       .attr("height", rectHeight + 4)
       .attr("x", -rectWidth / 2 - 3)
       //.attr("y", -rectHeight / 2 - 4);
       .attr("y", -rectHeight / 2 - 4);
    gEl.select(".diamond")
       .attr("d", function() {
         return "M " + dim / 2 + " 0 L " + dim + " " + dim / 2 + " L " + dim / 2 + " " + dim
           + " L 0 " + dim / 2 + " Z";
       })
       .attr("transform", function (d) { return "translate(-" + dim / 2 + ",-" + dim /2 + ")"; });
    gEl.select("ellipse")
       .attr("rx", Math.max(textSize.width / 2 + 20, this.consts.minEllipseRx))
       .attr("ry", Math.max(textSize.height / 2 + 17, this.consts.minEllipseRy));

    // Prepare a boundary value for determining arrowhead positions on edges:
    var minBoundaryRadius = Math.sqrt(rectWidth * rectWidth + rectHeight * rectHeight) / 2;
    switch (gEl[0][0].__data__.shape) {
      case "rectangle":
        d.width = gEl.select("rect").attr("width"); // Store for computeRectangleBoundary(...)
        d.height = gEl.select("rect").attr("height");
        break;
      case "diamond":
        d.boundary = dim / 2 + 16;
        break;
      case "ellipse":
        d.rx = gEl.select("ellipse").attr("rx"); // Store for computeEllipseBoundary(...)
        d.ry = gEl.select("ellipse").attr("ry");
        break;
      case "circle":
      case "noBorder":
        d.boundary = minBoundaryRadius + 16;
        break;
      default: // edge: boundary not applicable
        break;
    }
  }; // end insertTextLineBreaks


  // Remove links associated with a node
  GraphCreator.prototype.spliceLinksForNode = function(node) {
    var thisGraph = this,
        toSplice = thisGraph.links.filter(function(l) {
      return (l.source === node || l.target === node);
    });
    toSplice.map(function(l) {
      thisGraph.links.splice(thisGraph.links.indexOf(l), 1);
    });
  };


  // Includes setting selected edge to selected edge color.
  GraphCreator.prototype.replaceSelectEdge = function(d3Path, edgeData) {
    if (d3.event.shiftKey) return;
    var thisGraph = this;
    d3Path.classed(thisGraph.consts.selectedClass, true);
    d3Path.select("path")
      .style("stroke", "rgb(229, 172, 247)")
      .style("marker-end", "url(#selected-end-arrow)");
    d3Path.select(".foregroundText")
      .style("fill", "rgb(229, 172, 247)");
    if (thisGraph.state.selectedEdge) {
      thisGraph.removeSelectFromEdge();
    }
    thisGraph.state.selectedEdge = edgeData;
  };


  GraphCreator.prototype.replaceSelectNode = function(d3Node, nodeData) {
    var thisGraph = this;
    d3Node.classed(this.consts.selectedClass, true);
    if (thisGraph.state.selectedNode) {
      thisGraph.removeSelectFromNode();
    }
    thisGraph.state.selectedNode = nodeData;
  };

 
  GraphCreator.prototype.removeSelectFromNode = function() {
    var thisGraph = this;
    thisGraph.shapes.filter(function(cd) {
      return cd.id === thisGraph.state.selectedNode.id;
    }).classed(thisGraph.consts.selectedClass, false);
    thisGraph.state.selectedNode = null;
  };

 
  // Includes setting edge color back to its unselected value.
  GraphCreator.prototype.removeSelectFromEdge = function() {
    var thisGraph = this;
    var deselectedEdgeGroup = thisGraph.paths.filter(function(cd) {
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

 
  GraphCreator.prototype.pathMouseDown = function(d3path, d) {
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
  GraphCreator.prototype.shapeMouseDown = function(d3node, d) {
    var thisGraph = this,
        state = thisGraph.state;
    d3.event.stopPropagation();
    state.mouseDownNode = d;
    if (d3.event.shiftKey) {
      state.shiftNodeDrag = d3.event.shiftKey;
     // Reposition dragged directed edge
      thisGraph.dragLine.classed("hidden", false)
        .attr("d", "M" + d.x + "," + d.y + "L" + d.x + "," + d.y);
    } 
  };
 

  // Place editable text on node or edge in place of svg text
  GraphCreator.prototype.changeElementText = function(d3element, d) {
    var thisGraph= this,
        consts = thisGraph.consts,
        htmlEl = d3element.node();
    d3element.selectAll("text").remove();
    var nodeBCR = htmlEl.getBoundingClientRect(),
        curScale = nodeBCR.width / (consts.minCircleRadius * 2),
        placePad  =  5 * curScale,
        //useHW = curScale > 1 ? nodeBCR.width * 0.71 : consts.minCircleRadius * 2.84;
        useHW = curScale > 1 ? nodeBCR.width * 1.71 : consts.minCircleRadius * 4.84;
    //console.log("changeElementText; nodeBCR: " + JSON.stringify(nodeBCR));
    // Replace with editable content text
    var d3txt = thisGraph.svg.selectAll("foreignObject")
	.data([d])
      .enter().append("foreignObject")
	.attr("x", nodeBCR.left + placePad )
        .attr("y", nodeBCR.top + placePad)
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
	thisGraph.insertTextLineBreaks(d3element, d);
	d3.select(this.parentElement).remove();
        thisGraph.updateGraph(); 
      });
    return d3txt;
  };

 
  // Mouseup on nodes
  GraphCreator.prototype.shapeMouseUp = function(d3node, d) {
    var thisGraph = this,
        state = thisGraph.state,
        consts = thisGraph.consts;
    // Reset the states
    state.shiftNodeDrag = false;
    d3node.classed(consts.connectClass, false);

    var mouseDownNode = state.mouseDownNode;

    if (!mouseDownNode) return;

    thisGraph.dragLine.classed("hidden", true);

    if (mouseDownNode !== d) { // We're in a different node: create new edge and add to graph
      var newEdge = {source: mouseDownNode,
                     target: d,
                     style: thisGraph.edgeStyle,
                     color: thisGraph.clr, 
                     name: consts.defaultEdgeText + " " + thisGraph.edgeNum++};
      var filtRes = thisGraph.paths.filter(function(d) {
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
  GraphCreator.prototype.svgMouseDown = function() {
    this.state.graphMouseDown = true;
  };
 

  // Mouseup on main svg
  GraphCreator.prototype.svgMouseUp = function() {
    var thisGraph = this,
        state = thisGraph.state;
    if (state.justScaleTransGraph) { // Dragged not clicked
      state.justScaleTransGraph = false;
    } else if (state.graphMouseDown && d3.event.shiftKey) { // Clicked not dragged from svg
      var xycoords = d3.mouse(thisGraph.svgG.node());

      var d = {id: thisGraph.idct++,
               name: thisGraph.consts.defaultNodeText,
               x: xycoords[0],
               y: xycoords[1],
               color: thisGraph.clr,
               shape: thisGraph.shapeSelected};
      thisGraph.nodes.push(d);
      thisGraph.updateGraph();
      // Make text immediately editable
      var d3txt = thisGraph.changeElementText(thisGraph.shapes.filter(function(dval) {
        return dval.id === d.id;
      }), d),
          txtNode = d3txt.node();
      thisGraph.selectElementContents(txtNode);
      txtNode.focus();
    } else if (state.shiftNodeDrag) {
      // Dragged from node
      state.shiftNodeDrag = false;
      thisGraph.dragLine.classed("hidden", true);
    } 

    state.graphMouseDown = false;
  };

 
  // Keydown on main svg
  GraphCreator.prototype.svgKeyDown = function() {
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
 

  GraphCreator.prototype.svgKeyUp = function() {
    this.state.lastKeyDown = -1;
  };


  // Returns new end point p2'. Arg "change" is in pixels. Negative "change" shortens the line.
  GraphCreator.prototype.changeLineLength = function(x1, y1, x2, y2, change) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var length = Math.sqrt(dx * dx + dy * dy);
    if (length > 0) {
      dx /= length;
      dy /= length;
    }
    dx *= (length + change);
    dy *= (length + change);
    var p2 = {"x": x1 + dx, "y": y1 + dy};
    return p2;
  }
 

  // Call to propagate changes to graph
  GraphCreator.prototype.updateGraph = function() {
    var thisGraph = this,
        consts = thisGraph.consts,
        state = thisGraph.state;

    // Update existing nodes
    thisGraph.shapes = thisGraph.shapes.data(thisGraph.nodes, function(d) { return d.id; });
    thisGraph.shapes.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")";});

    // Add new nodes
    var newShapeGs = thisGraph.shapes.enter().append("g")

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
    var elts = [];

    for (var i = 0; i < thisGraph.nodes.length; i++) {
      var shape;
      switch (thisGraph.nodes[i].shape) {
        case "rectangle":
          shape = "rect";
          break;
        case "diamond":
          shape = "path";
          break;
        case "noBorder":
          shape = "circle";
          break;
        default: // circle and ellipse
          shape = thisGraph.nodes[i].shape;
          break;
      }
      var elt = document.createElementNS("http://www.w3.org/2000/svg", shape);
      elts.push(elt);
    }

    // Add the newly created shapes to the graph, assigning attributes common to all:
    newShapeGs.append(function(d, i) { return elts[i]; })
	 .classed("shape", true)
	 .attr("class", function(d) { return d.shape; })
	 .style("stroke", function(d) { return d.color; })
	 .style("stroke-width", function(d) { return (d.shape === "noBorder") ? 0 : 2; });

    newShapeGs.each(function(d) {
      thisGraph.insertTextLineBreaks(d3.select(this), d);
    });

    // Remove old nodes
    thisGraph.shapes.exit().remove();

    var paths = thisGraph.paths = thisGraph.paths.data(thisGraph.links, function(d) {
      return String(d.source.id) + "+" + String(d.target.id);
    });

    // Update existing paths:
    paths.classed(consts.selectedClass, function(d) {
	return d === state.selectedEdge;
      })
      .attr("d",  function(d) {
	return thisGraph.setPath(d);
      });

    // Add new paths
    var newPathGs = paths.enter().append("g");
     
    newPathGs.classed(thisGraph.consts.pathGClass, "true")
      .on("mousedown", function(d) {
	thisGraph.pathMouseDown.call(thisGraph, d3.select(this), d);
      })
      .on("mouseup", function(d) {
	if (d3.event.shiftKey) {
	  var d3txt = thisGraph.changeElementText(d3.select(this), d);
	  var txtNode = d3txt.node();
	  thisGraph.selectElementContents(txtNode);
	  txtNode.focus();
	}
	state.mouseDownLink = null;
      })
      .append("path")
	.style("marker-end", function(d) {
	  var clr = d.color ? d.color.substr(1) : d.target.color.substr(1);
	  return "url(#end-arrow" + clr + ")";
        })
	.classed("link", true)
	.style("stroke", function(d) { return d.color? d.color : d.target.color; })
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
  
    // Using "d3.selectAll(".pathG").append("text")" I kept appending new identical text
    // objects to each pathG whenever I dragged a node around, i.e., every time updateGraph()
    // was called. So I'm checking to make sure that there aren't already text objects appended
    // They would be pathGs[0][i].childNodes[1] and [2] , where the 0th element is expected to be
    // the path) before appending text.
    //
    // Note that there are two text elements being appended. The first is background shadow
    // to ensure that the text is visible whatever's behind it.
    for (var i = 0; i < pathGs[0].length; i++) {         // For each pathG...
      if (pathGs[0][i].childNodes.length < 3) {          // ...if there's no text yet...
        var t = d3.select(pathGs[0][i]).append("text")   // ...then append it.
          .classed("shadowText", "true")
          .attr("text-anchor","middle")
	  .text( function(d) {
	     return d.name;
	  })
	  .attr("x", function(d) {
	    return (d.source.x + d.target.x) / 2;
	  })
	  .attr("y", function(d) {
	    return (d.source.y + d.target.y) / 2;
	  })
          .style("stroke", "rgb(248, 248, 248)")
          .style("stroke-width", "4px")
	  .style("fill", function(d) {
	    return d.color;
	  });

        d3.select(pathGs[0][i]).append("text")  
          .classed("foregroundText", "true")
          .attr("text-anchor","middle")
          .text( function(d) {
             return d.name;
          })
          .attr("x", function(d) {
            return (d.source.x + d.target.x) / 2;
          })
          .attr("y", function(d) {
            return (d.source.y + d.target.y) / 2;
          })
          .style("fill", function(d) {
            return d.color;
          })
      }
    }

    d3.selectAll(".pathG").selectAll("text")
      .attr("x", function(d) {
        return (d.source.x + d.target.x) / 2;
      }) 
      .attr("y", function(d) {
        return (d.source.y + d.target.y) / 2;
      }); 

    // Remove old links
    paths.exit().remove();
  };


  GraphCreator.prototype.zoomed = function() {
    this.state.justScaleTransGraph = true;
    d3.select("." + this.consts.graphClass)
      .attr("transform", "translate(" + d3.event.translate + ") scale(" + d3.event.scale + ")");
  };


  GraphCreator.prototype.updateWindow = function(svg) {
    var docEl = document.documentElement,
        bodyEl = document.getElementsByTagName("body")[0];
    var x = window.innerWidth || docEl.clientWidth || bodyEl.clientWidth;
    var y = window.innerHeight|| docEl.clientHeight|| bodyEl.clientHeight;
    svg.attr("width", x).attr("height", y);
  };


  // http://warpycode.wordpress.com/2011/01/21/calculating-the-distance-to-the-edge-of-an-ellipse/
  // Angle theta is measured from the -y axis (recalling that +y is down) clockwise.
  GraphCreator.prototype.computeEllipseBoundary = function(edge) {
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
  GraphCreator.prototype.computeRectangleBoundary = function(edge) {
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


  GraphCreator.prototype.setPath = function(edge) {
    var boundary = 0;
    switch (edge.target.shape) {
      case "ellipse": 
        boundary = this.computeEllipseBoundary(edge);
        break;
      case ("rectangle"):
        boundary = this.computeRectangleBoundary(edge);
        break;
      default:
        boundary = edge.target.boundary;
        break;
    }
    
    var newP2 = this.changeLineLength(edge.source.x, edge.source.y, edge.target.x, edge.target.y,
                                     -boundary);
    return "M" + edge.source.x + "," + edge.source.y + "L" + newP2.x + "," + newP2.y;
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
  var graph = new GraphCreator(svg, nodes, links);
  graph.setIdCt(0);
  graph.updateGraph();
})(window.d3, window.saveAs, window.Blob);
