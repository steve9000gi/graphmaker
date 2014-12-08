graphbuilder
======================

Interactive tool for creating directed graphs, created using d3.js.

Based on http://bl.ocks.org/cjrd/6863459

Operation:

* Drag/scroll to translate/zoom.
* Click on a shape in the toolbar to select node shape (or for a node with none use "no border").
* Click on a color in the toolbar to select a color for creating new nodes and edges.
* Shift-click on empty space to create a node of the selected shape and color.
* Click on the appropriate arrow in the toolbar to select edge style: dashed or solid.
* Shift-click on a node, then drag to another node to connect them with an edge.
* Shift-click on a node's text to edit.
* Click on a node or edge to select and press backspace/delete to delete. Note: a node's background
  turns blue when you're hovering over it, and pink when selected.
* Control-click on a node with underlined text to open an associated external url.
* Alt-click on a node to see, attach new (or change an existing) url.
* Click on the cloud with the up-arrow to open/upload a file from your machine.
* Click on the square with the down-arrow to save the graph to your computer.

Run:

* `python -m SimpleHTTPServer 8000`
* navigate to http://127.0.0.1:8000

Github repo is at https://github.com/steve9000gi/graphmaker

License: MIT/X







