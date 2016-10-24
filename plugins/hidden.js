;(function(Backbone) {
'use strict';

function _createObserver(el) {
	var previousDisplay = null;
	return function(key, value) {
		var hidden = Backbone.Cord.convertToBool(value);
		// On the first call, store the original display value
		if(previousDisplay === null)
			previousDisplay = el.style.display;
		el.style.display = hidden ? 'none' : previousDisplay;
	};
}

function _createInvisibleObserver(el) {
	return function(key, value) {
		el.style.visibility = Backbone.Cord.convertToBool(value) ? 'hidden' : 'visible';
	};
}

function _hidden(context, attrs) {
	if(!context.isView)
		return;
	if(attrs.hidden) {
		this.observe(attrs.hidden, _createObserver(context.el), true);
		delete attrs.hidden;
	}
	if(attrs.invisible) {
		this.observe(attrs.invisible, _createInvisibleObserver(context.el), true);
		delete attrs.invisible;
	}
}

// Hide or show an element by setting display none on a truthy value of a bound variable specified as the hidden attribute
// Not very compatible with other code that sets the display with javascript
// Will cache and restore the display value before changing to hidden
Backbone.Cord.plugins.push({
	name: 'hidden',
	attrs: _hidden,
	bindings: _hidden
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
