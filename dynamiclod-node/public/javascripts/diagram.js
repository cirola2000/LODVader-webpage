var w = window.innerWidth || document.documentElement.clientWidth
	|| document.body.clientWidth;

var h = window.innerHeight || document.documentElement.clientHeight
	|| document.body.clientHeight;

// var width = 1300;
// var height = 800,

var width = $('#diagram').width(), // svg width
	height = $('#diagram').height(), // svg height
	dr = 4, // default point radius
	off = 39, // cluster hull offset
	expand = {}, // expanded clusters
	data, net, force, hullg, hull, linkg, link, nodeg, node;

var level = 4;

var svgContainer;

var linkColor;



//start grouping functions

var curve = d3.svg.line().interpolate("cardinal-closed").tension(.85);

var fill = d3.scale.category20();

function noop() {
	return false;
}

function nodeid(n) {
	return n.size ? "_g_" + n.group : n.name;
}

function linkid(l) {
	var u = nodeid(l.source), v = nodeid(l.target);
	return u < v ? u + "|" + v : v + "|" + u;
}

function getGroup(n) {
	return n.group;
}

// Constructs the network to visualize
// Regenerates he nodes and links from the original data, based on the expand[]
// info, i.e. which group(s) should be shown in expanded form and which
// shouldn't.
function network(data, prev, index, expand) {
	expand = expand || {};
	var gm = {}, // group map
		nm = {}, // node map
		lm = {}, // link map
		gn = {}, // previous group nodes
		gc = {}, // previous group centroids
		nodes = [], // output nodes
		links = []; // output links

	// process previous nodes for reuse or centroid calculation
	if (prev) {
		prev.nodes.forEach(function (n) {
			var i = index(n), o;
			if (n.size > 0) {
				gn[i] = n;
				n.size = 0;
			} else {
				o = gc[i] || (gc[i] = {
					x: 0,
					y: 0,
					count: 0
				});
				o.x += n.x;
				o.y += n.y;
				o.count += 1;
			}
		});
	}

	// determine nodes
	for (var k = 0; k < data.nodes.length; ++k) {
		var n = data.nodes[k], i = index(n), l = gm[i] || (gm[i] = gn[i])
			|| (gm[i] = {
				group: i,
				size: 0,
				nodes: []
			});

		if (expand[i]) {
			// the node should be directly visible
			nm[n.name] = nodes.length;
			nodes.push(n);
			if (gn[i]) {
				// place new nodes at cluster location (plus jitter)
				n.x = gn[i].x + Math.random();
				n.y = gn[i].y + Math.random();
			}
		} else {
			// the node is part of a collapsed cluster
			l.group_name = data.nodes[k].group_name;
			if (l.size == 0) {
				// if new cluster, add to set and position at centroid of leaf
				// nodes
				nm[i] = nodes.length;
				nodes.push(l);
				if (gc[i]) {
					l.x = gc[i].x / gc[i].count;
					l.y = gc[i].y / gc[i].count;
				}
			}
			l.nodes.push(n);
		}
		// always count group size as we also use it to tweak the force graph
		// strengths/distances
		l.size += 1;
		n.group_data = l;
	}

	for (i in gm) {
		gm[i].link_count = 0;

	}

	// determine links
	console.log();
	for (k = 0; k < data.links.length; ++k) {
		var e = data.links[k], u = index(e.source), v = index(e.target), value = e.value;
		if (u != v) {
			gm[u].link_count++;
			gm[v].link_count++;
		}
		
		u = expand[u] ? nm[e.source.name] : nm[u];
		v = expand[v] ? nm[e.target.name] : nm[v];

		// var i = (u < v ? u + "|" + v : v + "|" + u);
		var i = u + "|" + v ;
		
		l = lm[i] || (lm[i] = {
			source: u,
			target: v,
			value: value,
			size: 0
		});
		l.size += 1;

	}
	for (i in lm) {
		links.push(lm[i]);
	}

	return {
		nodes: nodes,
		links: links
	};
}

function convexHulls(nodes, index, offset) {
	var hulls = {};

	// create point sets
	for (var k = 0; k < nodes.length; ++k) {
		var n = nodes[k];
		if (n.size)
			continue;
		var i = index(n), l = hulls[i] || (hulls[i] = []);
		l.push([n.x - offset, n.y - offset]);
		l.push([n.x - offset, n.y + offset]);
		l.push([n.x + offset, n.y - offset]);
		l.push([n.x + offset, n.y + offset]);
	}

	// create convex hulls
	var hullset = [];
	for (i in hulls) {
		hullset.push({
			group: i,
			path: d3.geom.hull(hulls[i])
		});
	}

	return hullset;
}

function drawCluster(d) {
	return curve(d.path); // 0.8
}

function getByValue2(arr, value) {

	var result = arr.filter(function (o) { return o.name == value; });

	return result ? result[0] : null; // or undefined

}

// end grouping functions


// console.log(getUrlParameter("dataset"));
var showAll = false;

var requestLink;

var baseRequestLink = "/partial/proxy/linkset/graph?";

// if (typeof getUrlParameter("getAllDistributions") != 'undefined') {
// requestLink = baseRequestLink + "getAllDistributions=" + "&";
// }
if (typeof getUrlParameter("dataset") != 'undefined') {
	requestLink = getUrlParameter("dataset") + "&";
	if (getUrlParameter("dataset") == "")
		showAll = true;
	makeGraph(requestLink)
} else
	makeGraph("");



function makeGraph(param) {
	if (param != "") {
		param = param.replace(new RegExp("#", "g"), '%23');
		param = param.replace(new RegExp("_anchor", "g"), '');
		requestLink = "/partial/proxy/linkset/graph?dataset=" + param;
	}
	if (showAll) {
		requestLink = baseRequestLink + "getAllDistributions=" + "&";
	}
	// console.log(param);

	var color = d3.scale.category20();

	var nodeMap = {};
	
	if($('input[name=linkType]:checked').val()=="showDarkLOD"){
		linkColor = "rgb(255, 0, 0)";
	}
	else
		linkColor = "rgb(253, 141, 60)";
	

	$.post(requestLink,
		function (circleData) {
			data = {};
			expand = {};
			d3.select("svg").remove();
			data = circleData;
			$("#loading_gif").hide();
			$("#filter").prop('disabled', false);
						
			// Create the SVG Viewport
			svgContainer = d3.select("#diagram").append("svg")
				.attr("width", width).attr("height", height)
				.attr("pointer-events", "all")
			// .append('svg:g')
				.call(d3.behavior.zoom().on("zoom", redraw))
				.append('svg:g');
				
			svgContainer.append('svg:rect').attr('width', w).attr(
				'height', h).attr('fill', 'white');
				
			// // 		 			// build the arrow.
			// svgContainer.append("svg:defs").selectAll("marker")
			// 	.data(["end"]).enter().append("svg:marker")
			// 	.attr("id", String)
			// 	.attr("viewBox","0 -5 10 10")
			// 	.attr("refX", 43)
			// 	.attr("refY", 0)
			// 	.attr("markerWidth", 4)
			// 	.attr("markerHeight", 4)
			// 	.attr("orient", "auto")
			// 	.append("svg:path")
			// 	.attr("d", "M0,-5L10,0L0,5");
						
			// start grouping nodes
			for (var i in data.links) {
				var o = data.links[i];
				o.source = getByValue2(data.nodes, o.source);
				o.target = getByValue2(data.nodes, o.target);
				o.value = data.links[i].value;
			}

			hullg = svgContainer.append("g");
			linkg = svgContainer.append("g");
			nodeg = svgContainer.append("g");

			svgContainer.attr("opacity", 1e-6)
				.transition()
				.duration(1000)
				.attr("opacity", 1);

			function redraw() {
				// console.log("here", d3.event.translate,
				// 	d3.event.scale);
				svgContainer.attr("transform", "translate("
					+ d3.event.translate + ")" + " scale("
					+ d3.event.scale + ")");
			}
				
				// 		 			// build the arrow.
			svgContainer.append("svg:defs").selectAll("marker")
				.data(["end2"]).enter().append("svg:marker")
				.attr("id", String)
				.attr("viewBox","0 -5 10 10")
				.attr("refX", 45)
				.attr("refY", 0)
				.attr("markerWidth", 4)
				.attr("markerHeight", 4)
				.attr("orient", "auto")
				.append("svg:path")
				.attr("d", "M0,-5L10,0L0,5");
				
				
			init();


		}, 'json');
}

function getUrlParameter(sParam) {
	var sPageURL = window.location.search.substring(1);
	var sURLVariables = sPageURL.split('&');
	for (var i = 0; i < sURLVariables.length; i++) {
		var sParameterName = sURLVariables[i].split('=');
		if (sParameterName[0] == sParam) {
			return sParameterName[1];
		}
	}
}


function init() {
	if (force) force.stop();

	net = network(data, net, getGroup, expand);

	force = d3.layout.force()
		.nodes(net.nodes)
		.links(net.links)
		.size([width, height])
		.linkDistance(function (l, i) {
		var n1 = l.source, n2 = l.target;
		// larger distance for bigger groups:
		// both between single nodes and _other_ groups (where size of own node group still counts),
		// and between two group nodes.
		//
		// reduce distance for groups with very few outer links,
		// again both in expanded and grouped form, i.e. between individual nodes of a group and
		// nodes of another group or other group node or between two group nodes.
		//
		// The latter was done to keep the single-link groups ('blue', rose, ...) close.
		return 190 +
			Math.min(20 * Math.min((n1.size || (n1.group != n2.group ? n1.group_data.size : 0)),
				(n2.size || (n1.group != n2.group ? n2.group_data.size : 0))),
				-30 +
				30 * Math.min((n1.link_count || (n1.group != n2.group ? n1.group_data.link_count : 0)),
					(n2.link_count || (n1.group != n2.group ? n2.group_data.link_count : 0))),
				100);
		//return 150;
	})
		.linkStrength(function (l, i) {
		return 0.01;
	})
	//	    .gravity(0.05)   // gravity+charge tweaked to ensure good 'grouped' view (e.g. green group not smack between blue&orange, ...
	//	    .charge(-600)    // ... charge is important to turn single-linked groups to the outside
	//	    .friction(0.5)   // friction adjusted to get dampened display: less bouncy bouncy ball [Swedish Chef, anyone?]
		.friction(0.14)
		.charge(-255)
		.gravity(0.01)
		.theta(1.9)
		.alpha(1.9)
		.start();
	  
	//		HERE
	function collide(node) {
		
		if(typeof node.radius == "undefined"){
			node.radius = 31;
		}
		
		var r = node.radius + 16, nx1 = node.x - r, nx2 = node.x
			+ r, ny1 = node.y - r, ny2 = node.y + r;
		return function (quad, x1, y1, x2, y2) {
			if (quad.point && (quad.point !== node)) {
				var x = node.x - quad.point.x, y = node.y
					- quad.point.y, l = Math.sqrt(x * x
						+ y * y), r = node.radius + 10
						+ quad.point.radius + 10;
				if (l < r) {
					l = (l - r) / l * .5;
					node.x -= x *= l;
					node.y -= y *= l;
					quad.point.x += x;
					quad.point.y += y;
				}
			}
			return x1 > nx2 || x2 < nx1 || y1 > ny2
				|| y2 < ny1;
		};
	}

	// tooltip for links
	var tooltip = d3.select("body").append("div").attr(
		'class', 'tooltip2').style("position",
		"absolute").style("z-index", "10").style(
		"visibility", "hidden");


	hullg.selectAll("path.hull").remove();
	hull = hullg.selectAll("path.hull")
		.data(convexHulls(net.nodes, getGroup, off))
		.enter().append("path")
		.attr("class", "hull")
		.attr("d", drawCluster)

		.style("fill", function (d) { return fill(d.group); })
		.on("click", function (d) {
	    	  if (d3.event.defaultPrevented) return; // click suppressed
	    	  // console.log("hull click", d, arguments, this, expand[d.group]);
	    	  expand[d.group] = false; init();
	});



// creating links
	link = linkg.selectAll("line.link").data(net.links, linkid);
	//ciro
	
	link.exit().remove();
	link.enter().append("line")
		.attr("x1", function (d) { return d.source.x; })
		.attr("y1", function (d) { return d.source.y; })
		.attr("x2", function (d) { return d.target.x; })
		.attr("y2", function (d) { return d.target.y; })
		.style("stroke-width", function (d) { return 2.3; })
		.style("stroke", function (d) {
			if (d.value != "S")
				return linkColor;
			else
				return "#666";
		})
		.attr("class", "link")
		.on("click", function (d) {
			// openLinkDialog();
		})
		.on("mouseover", function (d) {
			d3.select(this).style("stroke", "red");
			if (d.value != "S")
				// tooltip.text("Links: " + d.value+" (click for details)");
				tooltip.text("Links: " + d.value);
			else
				tooltip.text("a dcat:subset .");
			return tooltip.style("visibility", "visible");
		})
		.on(
		"mousemove",
		function () {
			return tooltip.style("top",
				(d3.event.pageY - 10) + "px")
				.style(
				"left",
				(d3.event.pageX + 10)
				+ "px");
		}).on("mouseout", function () {
			d3.select(this).style("stroke", function (d) {
				if (d.value != "S")
					return linkColor;
				else
					return "#666";
		});
		return tooltip.style("visibility", "hidden");
	}).attr("marker-end", function (d) {
		 	// if (d.source.x != d.target.x) {
			// 	  	return "url(#end)"; 
			// 	  } else 
			// 	  	return "url(#end)"; 
			
			if( typeof d.target['group_name'] != "undefined"){
				if (d.source != d.target) {
				  	return "url(#end2)"; 
				  } else 
				  	return ""; 
				
			}
			else{
				if (d.source != d.target) {
				  	return "url(#end)"; 
				  } else 
				  	return ""; 
			}
			// d.target['text']
			

		});

	node = nodeg.selectAll("g.node").data(net.nodes, nodeid);
	node.exit().remove();
	var onEnter = node.enter();
	var g = onEnter
		.append("g")
		.attr("class", function (d) { return "node" + (d.size ? "" : " leaf"); })
		.attr("transform", function (d) {
		return "translate(" + d.x + "," + d.y + ")";
	}); 
	  
	g.append("circle")
	// if (d.size) -- d.size > 0 when d is a group node.      
		.attr("r", function (d) { return d.size ? 33 : d.radius; })
		.style("stroke", function (d) {
			// vocab stroke
			if(typeof d.nodes != "undefined")
				if(d.nodes[0].isVocab){
					return "rgb(253, 174, 107)";
				}
			if (d.size > 0) 
				return "rgb(144, 209, 228)"; 
				})
		.style("stroke-width", function (d) { if (d.size > 0) return 2; })
		.style("cursor",  function (d) { if (true) return "pointer"; })
		// .style("fill", function (d) { if (d.name) return d.color; else return fill(d.group); })
		.style("fill", function (d) {
			
			// vocab color
			if(typeof d.nodes != "undefined")
				if(d.nodes[0].isVocab){
					return "rgb(253, 174, 107)";
				}
			 if (d.name) return d.color; 
			 else return "rgb(107, 174, 214)"; 
			 })
		.on("click", function (d) {
		
			// vocab click
			if(typeof d.nodes != "undefined")
				if(d.nodes[0].isVocab){
				return ;
			}
			
			if (d3.event.defaultPrevented) return; // click suppressed
			// console.log("node click", d, arguments, this, expand[d.group]);
			if(d.group_data){
				// alert("oie");
			   return;	
			};
			
			// check whether the diagram represents bad links
			if(showingDarkLOD){
				return;
			}
			expand[d.group] = !expand[d.group];
			init();
		})
		.on("contextmenu", function(data, index) {
    		 //handle right click
    		 //stop showing browser menu
    		 d3.event.preventDefault();
			//  alert(data);
		
		});

		var text = g.append("foreignObject")
		.attr('width', function (d) {
		if (d.radius)
			return d.radius + 15;
		else
			return d.size + 43;
	})
		.attr('height', function (d) {
		if (d.radius)
			return d.radius + 14;
		else
			return d.size + 41;
	})
		.attr("x", function (d) { return "-24px"; })
		.attr("y", function (d) { return "-22px"; })
		.html(
		function (d) {
			if (d['text']) {
				return "<div style=\"font-size: 8px; pointer-events:none; cursor:pointer; text-align:center\">"
					+ d.text + "</div>";
			}
			else {
				return "<div style=\"font-size: 8px; pointer-events:none; cursor:pointer; text-align:center\">"
					+ d.group_name + "</div>";
			}
		});
	  

	node.call(force.drag);
	

	force.on("tick", function () {
		var q = d3.geom
			.quadtree(data.nodes), i = 0, n = data.nodes.length;
			var n2 = net.nodes.length;
			var q2 = d3.geom
			.quadtree(net.nodes);
		//   	  

		if (!hull.empty()) {
			hull.data(convexHulls(net.nodes, getGroup, off))
				.attr("d", drawCluster);
		}

		while (++i < n)
			q.visit(collide(data.nodes[i]));
			 i = 0;
		while (++i < n2){	
				
					
					q2.visit(collide(net.nodes[i]));
				
			
				
			// q2.visit(collide(net.nodes[i].nodes[i2]));
			}
			
		
		link.attr("x1", function (d) { return d.source.x+3; })
			.attr("y1", function (d) { return d.source.y+3; })
			.attr("x2", function (d) { return d.target.x-3; })
			.attr("y2", function (d) { return d.target.y-3; });


		node.attr("transform", function (d) {
			return "translate(" + d.x + "," + d.y + ")";
		});
	});
}