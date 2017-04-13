;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;

Cord.View.prototype.createSVGElement = Cord.createSVGElement = function(tagIdClasses, attrs) {
	var svgAttrs = {};
	if(!(typeof attrs === 'string' || attrs.nodeType === 1)) {
		for(var attr in attrs)
			if(attrs.hasOwnProperty(attr))
				svgAttrs[(attr === 'href') ? 'xlink:' + attr : attr] = attrs[attr];
	}
	var args = Array.prototype.slice.call(arguments);
	args.splice(0, 2, 'svg:' + tagIdClasses, svgAttrs);
	return this.createElement.apply(this, args);
};

var SVG_NS = 'http://www.w3.org/2000/svg';
var XLINK_NS = 'http://www.w3.org/1999/xlink';

Cord.plugins.push({
	name: 'svg',
	tag: function(context, tag) {
		if(tag.substr(0, 4) === 'svg:') {
			tag = tag.substr(4);
			return document.createElementNS(SVG_NS, tag);
		}
	},
	attrs: function(context, attrs) {
		var el = context.el;
		if(el.namespaceURI === SVG_NS) {
			for(var attr in attrs) {
				if(attrs.hasOwnProperty(attr)) {
					if(attr.substr(0, 6) === 'xlink:') {
						el.setAttributeNS(XLINK_NS, attr.substr(6), attrs[attr]);
						delete attrs[attr];
					}
					else if(attr.substr(0, 4) === 'xml:') {
						el.setAttributeNS(SVG_NS, attr.substr(4), attrs[attr]);
						delete attrs[attr];
					}
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
