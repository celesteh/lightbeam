/*function OSC()  {};


// by  Cristiano Belloni 
// https://github.com/janesconference/KievII
// http://kievii.net

////////////////////
// OSC Message
////////////////////

OSC.Message = function (address) {
    this.address = address;
    this.typetags = '';
    this.args = [];

    for (var i = 1; i < arguments.length; i++) {
        var arg = arguments[i];
        switch (typeof arg) {
        case 'object':
            if (arg.typetag) {
                this.typetags += arg.typetag;
                this.args.push(arg);
            } else {
                throw new Error("don't know how to encode object " + arg);
            }
            break;
        case 'number':
            if (Math.floor(arg) == arg) {
                this.typetags += OSC.TInt.prototype.typetag;
                this.args.push(new OSC.TInt(Math.floor(arg)));
            } else {
                this.typetags += OSC.TFloat.prototype.typetag;
                this.args.push(new OSC.TFloat(arg));
            }
            break;
        case 'string':
            this.typetags += OSC.TString.prototype.typetag;
            this.args.push(new OSC.TString(arg));
            break;
        default:
            throw new Error("don't know how to encode " + arg);
        }
    }
};

OSC.Message.prototype = {
    toBinary: function () {
        var address = new OSC.TString(this.address);
        var binary = [];
        var tempArray = [];
        tempArray = address.encode();
        binary = binary.concat(tempArray);
        if (this.typetags) {
            var typetags = new OSC.TString(',' + this.typetags);
            tempArray = typetags.encode();
            binary = binary.concat(tempArray);
            for (var i = 0; i < this.args.length; i++) {
                tempArray = this.args[i].encode();
                binary = binary.concat(tempArray);
            }
        }
        return binary;
    }
};

// Bundle does not work yet (uses message.append, which no longer exists)
OSC.Bundle = function (address, time) {
    OSC.Message.call(this, address);
    this.timetag = time || 0;
};

OSC.Bundle.prototype.append = function (arg) {
    var binary;
    if (arg instanceof Message) {
        binary = new OSC.TBlob(arg.toBinary());
    } else {
        var msg = new OSC.Message(this.address);
        if (typeof(arg) == 'Object') {
            if (arg.addr) {
                msg.address = arg.addr;
            }
            if (arg.args) {
                msg.append.apply(arg.args);
            }
        } else {
            msg.append(arg);
        }
        binary = new OSC.TBlob(msg.toBinary());
    }
    this.message += binary;
    this.typetags += 'b';
};

OSC.Bundle.prototype.toBinary = function () {
    var binary = new OSC.TString('#bundle');
    binary = binary.concat(new OSC.TTimeTag(this.timetag));
    binary = binary.concat(this.message);
    return binary;
};

////////////////////
// OSC Encoder
////////////////////

OSC.Encoder = function () {
};

OSC.Encoder.prototype = {
    encode: function () {
        var binary;
        if (arguments[0].toBinary) {
            binary = arguments[0].toBinary();
        } else {
            // cheesy
            var message = {};
            OSC.Message.apply(message, arguments);
            binary = OSC.Message.prototype.toBinary.call(message);
        }
        return binary;
    }
};

////////////////////
// OSC Message encoding and decoding functions
////////////////////

OSC.ShortBuffer = function (type, buf, requiredLength)
{
    this.type = "ShortBuffer";
    var message = "buffer [";
    for (var i = 0; i < buf.length; i++) {
        if (i) {
            message += ", ";
        }
        message += buf.charCodeAt(i);
    }
    message += "] too short for " + type + ", " + requiredLength + " bytes required";
    this.message = message;
};

OSC.TString = function (value) { this.value = value; };
OSC.TString.prototype = {
    typetag: 's',
    decode: function (data) {
        var end = 0;
        while (data[end] && end < data.length) {
            end++;
        }
        if (end == data.length) {
            throw Error("OSC string not null terminated");
        }
        
        //TODO
        //http://nodejs.org/docs/v0.4.7/api/buffers.html#buffer.toString
        //this.value = data.toString('ascii', 0, end);
        
        // This works in the browser
        this.value = String.fromCharCode.apply(null, data.slice(0,end));
        
        var nextData = parseInt(Math.ceil((end + 1) / 4.0) * 4, 10);
        return data.slice(nextData);
    },
    encode: function () {
        var len = Math.ceil((this.value.length + 1) / 4.0, 10) * 4;
        var tempBuf = new Array (len);
        return Struct.PackTo('>' + len + 's', tempBuf, 0, [ this.value ]);
    }
};

OSC.TInt = function (value) { this.value = value; };
OSC.TInt.prototype = {
    typetag: 'i',
    decode: function (data) {
        if (data.length < 4) {
            throw new ShortBuffer('int', data, 4);
        }

        this.value = Struct.Unpack('>i', data.slice(0, 4))[0];
        return data.slice(4);
    },
    encode: function () {
        var tempArray = new Array(4);
        return Struct.PackTo('>i', tempArray, 0, [ this.value ]);
    }
};

OSC.TTime = function (value) { this.value = value; };
OSC.TTime.prototype = {
    typetag: 't',
    decode: function (data) {
        if (data.length < 8) {
            throw new ShortBuffer('time', data, 8);
        }
        this.value = Struct.Unpack('>LL', data.slice(0, 8))[0];
        return data.slice(8);
    },
    encode: function (buf, pos) {
        return Struct.PackTo('>LL', buf, pos, this.value);
    }
};

OSC.TFloat = function (value) { this.value = value; };
OSC.TFloat.prototype = {
    typetag: 'f',
    decode: function (data) {
        if (data.length < 4) {
            throw new ShortBuffer('float', data, 4);
        }

        this.value = Struct.Unpack('>f', data.slice(0, 4))[0];
        return data.slice(4);
    },
    encode: function () {
        var tempArray = new Array(4);
        return Struct.PackTo('>f', tempArray, 0, [ this.value ]);
    }
};

OSC.TBlob = function (value) { this.value = value; };
OSC.TBlob.prototype = {
    typetag: 'b',
    decode: function (data) {
        var length = Struct.Unpack('>i', data.slice(0, 4))[0];
        var nextData = parseInt(Math.ceil((length) / 4.0) * 4, 10) + 4;
        this.value = data.slice(4, length + 4);
        return data.slice(nextData);
    },
    encode: function (buf, pos) {
        var len = Math.ceil((this.value.length) / 4.0, 10) * 4;
        return Struct.PackTo('>i' + len + 's', buf, pos, [len, this.value]);
    }
};

OSC.TDouble = function (value) { this.value = value; };
OSC.TDouble.prototype = {
    typetag: 'd',
    decode: function (data) {
        if (data.length < 8) {
            throw new ShortBuffer('double', data, 8);
        }
        this.value = Struct.Unpack('>d', data.slice(0, 8))[0];
        return data.slice(8);
    },
    encode: function (buf, pos) {
        return Struct.PackTo('>d', buf, pos, [ this.value ]);
    }
};

// for each OSC type tag we use a specific constructor function to decode its respective data
OSC.tagToConstructor = { 'i': function () { return new OSC.TInt(); },
                         'f': function () { return new OSC.TFloat(); },
                         's': function () { return new OSC.TString(); },
                         'b': function () { return new OSC.TBlob(); },
                         'd': function () { return new OSC.TDouble(); } };
                         
OSC.decodeBundle = function (data) {
    
    var bundle = [];
    var bundleElement = {time: null, args: []};
    
    // Decode the time tag
    var timeTag = new OSC.TTime();
    data = timeTag.decode(data);
    bundleElement.time = timeTag.value;
    
    while (data.length > 0) {
        // Get the data length
        var dataLen = new OSC.TInt();
        data = dataLen.decode(data);
        
        // Decode the next message
        var message = OSC.decode(data.slice(0, dataLen.value));
        
        // push it into the bundleElement
        bundleElement.args.push(message);
        
        // advance in the data array
        data = data.slice(dataLen.value);
    }
    bundle.push(bundleElement);
    return bundle;
};

OSC.decode = function (data) {
    // this stores the decoded data as an array
    var message = [];

    // we start getting the <address> and <rest> of OSC msg /<address>\0<rest>\0<typetags>\0<data>
    var address = new OSC.TString();
    data = address.decode(data);

    message.push(address.value);
    
    if (address.value === "#bundle") {
        // A bundle was detected, let's parse it
        return OSC.decodeBundle (data);
    }

    // if we have rest, maybe we have some typetags... let see...
    if (data.length > 0) {
        // now we advance on the old rest, getting <typetags>
        var typetags = new OSC.TString();
        data = typetags.decode(data);
        typetags = typetags.value;
        // so we start building our message list

        if (typetags[0] != ',') {
            throw "invalid type tag in incoming OSC message, must start with comma";
        }
        for (var i = 1; i < typetags.length; i++) {
            var constructor = OSC.tagToConstructor[typetags[i]];
            if (!constructor) {
                throw "Unsupported OSC type tag " + typetags[i] + " in incoming message";
            }
            var argument = constructor();
            data = argument.decode(data);
            message.push(argument.value);
        }
    }

    return message;
};

////////////////////
// OSC Decoder
////////////////////

 OSC.Decoder = function() {
    
    
};

OSC.Decoder.prototype.decode = function (msg) {
    
    // we decode the message getting a beautiful array with the form:
    // [<address>, <typetags>, <values>*]
    var decoded = OSC.decode(msg);
    try {
        if (decoded) {
            return decoded;
        }
    }
    catch (e) {
        console.log("can't decode incoming message: " + e.message);
    }
};

////////////////////////////////////////////////////////////////////////////////

// by  Cristiano Belloni 
// https://github.com/janesconference/KievII
// http://kievii.net

function OSCClient() {};

OSCClient = function (localClient, oscHandler) {
    
    this.oscHandler = oscHandler;
    this.clientID = localClient.clientID;
    this.oscCallback = localClient.oscCallback;
    this.isListening = localClient.isListening || true;
};

OSCClient.prototype.sendOSC = function (oscMessage, args) {
    // Encode it
    var binaryMsg = this.oscHandler.OSCEncoder.encode(oscMessage);
    var flags = args;
    
    if (typeof args === 'undefined') {
        flags = {sendRemote : true, sendLocal : true};
    }
    if (flags.sendRemote !== false) {
        if (this.oscHandler.proxyOK === true) {
            this.oscHandler.socket.emit('osc', { osc: binaryMsg });
        }
    }
    if (flags.sendLocal !== false) {
        this.oscHandler.sendLocalMessage.apply (this.oscHandler, [binaryMsg, this.clientID]);
    }
};


function OSCHandler()  {};

OSCHandler = function (proxyServer, udpServers) {

    this.localClients = {};
    this.OSCDecoder = new OSC().Decoder();
    this.OSCEncoder = new OSC().Encoder();
    this.udpServers = udpServers || null;
    this.proxyServer = proxyServer || null;
    this.proxyOK = false;
    this.proxyConnected = false;
    
    if (this.proxyServer !== null) {
        
        try {
            this.socket = io.connect('http://' + this.proxyServer.host + ':' + this.proxyServer.port);
        }
        catch (e) {
            console.error ("io.connect failed. No proxy server?");
            return;
        }
        this.socket.on('admin', function (data) {
            
            // TODO check the version and the ID
            console.log("Received an admin message: ", data);
            // Let's assume everything is OK
            this.proxyOK = true;
            
            // Send the host list to the server, if any
            if (this.udpServers !== null) {
                this.socket.emit ('admin', {type: 'udphosts', content: this.udpServers});
            }
            
        }.bind(this));
        
        this.socket.on ('osc', function (data) {
            
            // OSC is received from the server
            // Transform it in an array
            var oscArray = Array.prototype.slice.call(data.osc, 0);
            console.log ("received osc from the server: " + oscArray);
            
            // Send it to the local clients
            this.sendLocalMessage (oscArray);
        }.bind(this));
        
        this.socket.on ('disconnect', function (data) {
            
            console.log ("socket disconnected");
            this.proxyConnected = false;
            this.proxyOK = false;
            
        }.bind(this));
        
        this.socket.on ('connect', function (data) {
            
            console.log ("socket connected");
            this.proxyConnected = true;
            
        }.bind(this));
    }
};
// localclient = {clientID, oscCallback, isListening} 
OSCHandler.prototype.registerClient = function (localClient) {
    this.localClients[localClient.clientID] = new OSCClient (localClient, this);
    return this.localClients[localClient.clientID];
};

OSCHandler.prototype.unregisterClient = function (clientID) {
    delete this.localClients[clientID];
};

OSCHandler.prototype.sendLocalMessage = function (oscMessage, clientID) {
    // Try to decode it
    var received = this.OSCDecoder.decode (oscMessage);
    console.log ("decoded OSC = " + received);
    
    // Send it to the callbacks, except for the clientID one
    for (var client in this.localClients) {
        if (this.localClients.hasOwnProperty(client)) {
            var currClient = this.localClients[client];
            if ((currClient.clientID !== clientID) && (currClient.isListening)) {
                if (typeof currClient.oscCallback === 'function') {
                    currClient.oscCallback(received);
                }
            }
        }
    }
};
)

*/
/////////////////////////////////////////////////////////////////////////////////////////
// Graph Visualization

// Visualization of tracking data interconnections

(function(visualizations){
"use strict";


var graph = new Emitter();
visualizations.graph = graph;
graph.name = "graph";
var width = 750, height = 750;
var force, vis;
var edges, nodes;
var udpHosts, handler, client, proxyServer, encoder;


//require('OSC.js');

// There are three phases for a visualization life-cycle:
// init does initialization and receives the existing set of connections
// connection notifies of a new connection that matches existing filter
// remove lets the visualization know it is about to be switched out so it can clean up
graph.on('init', onInit);
// graph.on('connection', onConnection);
graph.on('remove', onRemove);
graph.on('reset', onReset);

/* for Highlighting and Colouring -------------------- */

var highlight = {
    visited: true,
    neverVisited: true,
    connections: true,
    cookies: true,
    watched: true,
    blocked: true
};

function onUpdate(){
    // new nodes, reheat graph simulation
    if (force){
        // console.log('restarting graph due to update');
        force.stop();
        force.nodes(filteredAggregate.nodes);
        force.links(filteredAggregate.edges);
        force.start();
        updateGraph();
        colourHighlightNodes(highlight);
    }else{
        console.log('the force is not with us');
    }
}

function onInit(){
     console.log('graph::onInit()');
     //console.log('initializing graph from %s connections', filteredAggregate.nodes.length);
    vis = d3.select(vizcanvas);
    // A D3 visualization has a two main components, data-shaping, and setting up the D3 callbacks
    // This binds our data to the D3 visualization and sets up the callbacks
    initGraph();
    aggregate.on('update', onUpdate);
    // Differenct visualizations may have different viewBoxes, so make sure we use the right one
    vizcanvas.setAttribute('viewBox', [0,0,width,height].join(' '));
    // console.log('graph::onInit end');
    document.querySelector(".filter-display").classList.remove("hidden");

 // the OSC bit
    proxyServer = {host: 'localhost', port: 1488};
    udpHosts = [{host: 'localhost', port: 57120}];
    handler = new OSCHandler(/*proxyServer*/ null, udpHosts);
    encoder = new OSC().Encoder();
 
    sendMsg(new Message('/hello'));

    console.log('hello!!');
    
    
};

function onRemove(){
    // var startTime = Date.now();
    if (force){
        force.stop();
        force = null;
    }
    resetCanvas();
    document.querySelector(".filter-display").classList.add("hidden");
    // console.log('it took %s ms to remove graph view', Date.now() - startTime);
};

function onReset(){
    onRemove();
    aggregate.emit('load', allConnections);
}


// OSC

function sendMsg(oscMessage, args) {
    // Encode it
    var binaryMsg = encoder.encode(oscMessage);
    var flags = args;
    oscHandler.socket.emit('osc', { osc: binaryMsg });
}

// UTILITIES FOR CREATING POLYGONS

function point(angle, size){
	return [Math.round(Math.cos(angle) * size), -Math.round(Math.sin(angle) * size)];
}

function polygon(points, size, debug){
    var increment = Math.PI * 2 / points;
    var angles = [], i;
    for (i = 0; i < points; i++){
        angles.push(i * increment + Math.PI/2); // add 90 degrees so first point is up
    }
    return angles.map(function(angle){ return point(angle, size); });
}

function polygonAsString(points, size){
    var poly = polygon(points, size);
    return poly.map(function(pair){return pair.join(',');}).join(' ');
}

// ACCESSOR FUNCTIONS

// function scaleNode(node){ return 'translate(' + node.x + ',' + node.y + ') scale(' + (1 + .05 * node.weight) + ')'; }
function visited(node){ return node.nodeType === 'site' || node.nodeType === 'both'; }
function notVisited(node){ return node.nodeType === 'thirdparty'; }
// function timestamp(node){ return node.lastAccess.toISOString(); }
// function nodeHighlight(node){ return ( node.visitedCount > 0 ) ? highlight.highlightVisited : highlight.highlightNeverVisited; }
// function sourceX(edge){ return edge.source.x; }
// function sourceY(edge){ return edge.source.y; }
// function targetX(edge){ return edge.target.x; }
// function targetY(edge){ return edge.target.y; }
// function edgeCookie(edge){ return edge.cookieCount > 0; }
// function edgeHighlight(edge){ return highlight.connections; }
// function edgeColoured(edge){ return edge.cookieCount > 0 && highlight.cookies; }
function nodeName(node){
    if (node){
        return node.name;
    }
    return undefined;
}
function watchSite(node){
    return siteHasPref(node.name,"watch");
}
function blockSite(node){
    return siteHasPref(node.name,"block");
}

// SET UP D3 HANDLERS

var ticking = false;

function charge(d){ return -(500 +  d.weight * 25); }

function initGraph(){
    // Initialize D3 layout and bind data
    // console.log('initGraph()');
    force = d3.layout.force()
        .nodes(filteredAggregate.nodes)
        .links(filteredAggregate.edges)
        .charge(charge)
        .size([width,height])
        .start();
    updateGraph();
    colourHighlightNodes(highlight);

    // update method
    var lastUpdate, lastTick;
    lastUpdate = lastTick = Date.now();
    var draws = [];
    var ticks = 0;
    const second = 1000;
    const minute = 60 * second;
    force.on('tick', function ontick(evt){
        // find a way to report how often tick() is called, and how long it takes to run
        // without trying to console.log() every 5 milliseconds...
        if (ticking){
            console.log('overlapping tick!');
            return;
        }
        ticking = true;
        var nextTick = Date.now();
        ticks++;
        lastTick = nextTick;
        if ((lastTick - lastUpdate) > second){
            // console.log('%s ticks per second, each draw takes %s milliseconds', ticks, Math.floor(d3.mean(draws)));
            lastUpdate = lastTick;
            draws = [];
            ticks = 0;
        }
        edges.each(function(d, i){
            // `this` is the DOM node
            this.setAttribute('x1', d.source.x);
            this.setAttribute('y1', d.source.y);
            this.setAttribute('x2', d.target.x);
            this.setAttribute('y2', d.target.y);
            if (d.cookieCount){
                this.classList.add('cookieYes');
            }else{
                this.classList.remove('cookieYes');
            }
            if (highlight.connections){
                this.classList.add('highlighted');
            }else{
                this.classList.remove('highlighted');
            }
            if (d.cookieCount && highlight.cookies){
                this.classList.add('coloured');
            }else{
                this.classList.remove('coloured');
            }
        });
        nodes.each(function(d,i){
            // `this` is the DOM node
            this.setAttribute('transform', 'translate(' + d.x + ',' + d.y + ') scale(' + (1 + .05 * d.weight) + ')');
            this.setAttribute('data-timestamp', d.lastAccess.toISOString());
            if (d.nodeType === 'site' || d.nodeType === 'both'){
                this.classList.add('visitedYes');
                this.classList.remove('visitedNo');
            }else{
                this.classList.add('visitedNo');
                this.classList.remove('visitedYes');
            }
            if ((d.nodeType === 'site' || d.nodeType === 'both') && highlight.visited){
                this.classList.add('highlighted');
            }else if((d.nodeType === 'thirdparty') && highlight.neverVisited){
                this.classList.add('highlighted');
            }else{
                this.classList.remove('highlighted');
            }
        });
        var endDraw = Date.now();
        draws.push(endDraw - lastTick);
        nodes.call(force.drag);

        ticking = false;
    });
}

function updateGraph(){
    // console.log('updateGraph()');
        // Data binding for links
    edges = vis.selectAll('.edge')
        .data(filteredAggregate.edges, nodeName );

    edges.enter().insert('line', ':first-child')
        .classed('edge', true);

    edges.exit()
        .remove();

    nodes = vis.selectAll('.node')
	    .data(filteredAggregate.nodes, nodeName );


	nodes.enter().append('g')
        .classed('visitedYes', visited )
        .classed('visitedNo', notVisited)
        .classed("watched",watchSite)
        .classed("blocked",blockSite)
        .call(addShape)
        .attr('data-name', nodeName)
        .on('mouseenter', tooltip.show)
        .on('mouseleave', tooltip.hide)
        .classed('node', true);

    nodes.exit()
        .remove();

}

function addFavicon(selection){
    selection.append("svg:image")
          .attr("class", "favicon")
          .attr("width", "16") // move these to the favicon class in css
          .attr("height", "16")
          .attr("x", "-8") // offset to make 16x16 favicon appear centered
          .attr("y", "-8")
          .attr("xlink:href", function(node) {return 'http://' + node.name + '/favicon.ico'; } );
}

function addCircle(selection){
    selection
        .append('circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', graphNodeRadius["graph"])
        .classed('site', true);
}

function addShape(selection){
    selection.filter('.visitedYes').call(addCircle).call(addFavicon);
    selection.filter('.visitedNo').call(addTriangle).call(addFavicon);
}

function addTriangle(selection){
    selection
        .append('polygon')
	    .attr('points', polygonAsString(3, 20))
        .attr('data-name', function(node){ return node.name; });
}



// FIXME: Move this out of visualization so multiple visualizations can use it.
function resetCanvas(){
    // You will still need to remove timer events
    var parent = vizcanvas.parentNode;
    var newcanvas = vizcanvas.cloneNode(false);
    var vizcanvasDefs = document.querySelector(".vizcanvas defs").cloneNode(true);
    newcanvas.appendChild(vizcanvasDefs);
    parent.replaceChild(newcanvas, vizcanvas);
    vizcanvas = newcanvas;
    aggregate.off('update', onUpdate);
}



var graphLegend = document.querySelector(".graph-footer");

legendBtnClickHandler(graphLegend);

graphLegend.querySelector(".legend-toggle-visited").addEventListener("click", function(event){
    var visited = document.querySelectorAll(".visitedYes");
    toggleVizElements(visited,"highlighted");
    highlight.visited = !highlight.visited;
});

graphLegend.querySelector(".legend-toggle-never-visited").addEventListener("click", function(event){
    var neverVisited = document.querySelectorAll(".visitedNo");
    toggleVizElements(neverVisited,"highlighted");
    highlight.neverVisited = !highlight.neverVisited;
});

graphLegend.querySelector(".legend-toggle-connections").addEventListener("click", function(event){
    var cookiesConnections = document.querySelectorAll(".edge");
    toggleVizElements(cookiesConnections,"highlighted");
    highlight.connections = !highlight.connections;
});

graphLegend.querySelector(".legend-toggle-cookies").addEventListener("click", function(event){
    var cookiesConnections = document.querySelectorAll(".cookieYes");
    toggleVizElements(cookiesConnections,"coloured");
    highlight.cookies = !highlight.cookies;
});

graphLegend.querySelector(".legend-toggle-watched").addEventListener("click", function(event){
    highlight.watched = !highlight.watched;
    colourHighlightNodes(highlight);
});

graphLegend.querySelector(".legend-toggle-blocked").addEventListener("click", function(event){
    highlight.blocked = !highlight.blocked;
    colourHighlightNodes(highlight);
});


graphLegend.querySelector(".legend-toggle").addEventListener("click", function(event){
    toggleLegendSection(event.target,graphLegend);
});


})(visualizations);
