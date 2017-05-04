;(function(Backbone) {
'use strict';

var SVG_NS = 'http://www.w3.org/2000/svg';
var XLINK_NS = 'http://www.w3.org/1999/xlink';

// Non-deprecated and non-conflicting SVG elements: https://developer.mozilla.org/en-US/docs/Web/SVG/Element
var SVG_TAGS = {
	animate: 1,
	animateMotion: 1,
	animateTransform: 1,
	circle: 1,
	clipPath: 1,
	'color-profile': 1,
	defs: 1,
	desc: 1,
	discard: 1,
	ellipse: 1,
	feBlend: 1,
	feColorMatrix: 1,
	feComponentTransfer: 1,
	feComposite: 1,
	feConvolveMatrix: 1,
	feDiffuseLighting: 1,
	feDisplacementMap: 1,
	feDistantLight: 1,
	feDropShadow: 1,
	feFlood: 1,
	feFuncA: 1,
	feFuncB: 1,
	feFuncG: 1,
	feFuncR: 1,
	feGaussianBlur: 1,
	feImage: 1,
	feMerge: 1,
	feMergeNode: 1,
	feMorphology: 1,
	feOffset: 1,
	fePointLight: 1,
	feSpecularLighting: 1,
	feSpotLight: 1,
	feTile: 1,
	feTurbulence: 1,
	filter: 1,
	font: 1,
	foreignObject: 1,
	g: 1,
	glyph: 1,
	hatch: 1,
	hatchpath: 1,
	image: 1,
	line: 1,
	linearGradient: 1,
	marker: 1,
	mask: 1,
	metadata: 1,
	mpath: 1,
	path: 1,
	pattern: 1,
	polygon: 1,
	polyline: 1,
	radialGradient: 1,
	rect: 1,
	set: 1,
	solidcolor: 1,
	stop: 1,
	svg: 1,
	'switch': 1,
	symbol: 1,
	text: 1,
	textPath: 1,
	tspan: 1,
	use: 1,
	view: 1
};

var XLINK_ATTRS = {
	href: 1,
	show: 1,
	title: 1
};

Backbone.Cord.plugins.push({
	name: 'svg',
	tag: function(context, tag) {
		// Most supported svg tags are provided in the SVG_TAGS, tags conflicting with html such as <a> or any other tag can be forced to SVG with svg or svg: prefix
		if(SVG_TAGS[tag]) {
			return document.createElementNS(SVG_NS, tag);
		}
		else if(tag.substr(0, 3) === 'svg') {
			tag = tag.substr(3);
			if(tag[0] === ':')
				tag = tag.substr(1);
			else
				tag = tag[0].toLowerCase() + tag.substr(1);
			return document.createElementNS(SVG_NS, tag);
		}
	},
	attrs: function(context, attrs) {
		var el = context.el;
		if(el.namespaceURI === SVG_NS) {
			// Normal SVG attributes are set by the default setAttribute function, but a few are xlink or xml namespaced
			for(var attr in attrs) {
				if(XLINK_ATTRS[attr]) {
					// xlink:x attributes
					el.setAttributeNS(XLINK_NS, attr, attrs[attr]);
					delete attrs[attr];
				}
				else if(attr === 'lang') {
					// xml:lang only
					el.setAttributeNS(SVG_NS, attr, attrs[attr]);
					delete attrs[attr];
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
