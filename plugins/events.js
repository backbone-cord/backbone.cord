;(function(Backbone) {
'use strict';

// Focus an element for keyboard events
// http://stackoverflow.com/questions/3656467/is-it-possible-to-focus-on-a-div-using-javascript-focus-function
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/tabindex
Backbone.Cord.View.prototype.focus = function(id) {
	var el = id ? this.getChildById(id) : this.el;
	// Add tabindex for elements that normally don't support focus and remove the webkit outline
	if(!el.getAttribute('tabindex')) {
		el.setAttribute('tabindex', -1);
		el.style.outline = 'none';
	}
	el.focus();
};

function _events(context, attrs) {
	for(var attr in attrs) {
		if(attr.substr(0,2) === 'on' && attrs.hasOwnProperty(attr)) {
			var listener = (typeof attrs[attr] === 'string') ? this[attrs[attr]] : attrs[attr];
			if(typeof listener === 'function') {
				if(context.isView)
					listener = listener.bind(this);
				context.el.addEventListener(attr.substr(2), listener);
			}
			delete attrs[attr];
		}
	}
}

Backbone.Cord.plugins.push({
	name: 'events',
	attrs: _events,
	bindings: _events
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone);
