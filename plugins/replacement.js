;(function(Backbone) {
'use strict';

var _replacementTags = {};

// Each replacement function is function(el, parent), where:
// * the el is augmented inside the parent (a document fragment)
// * or a new element is returned, replacing el inside it's parent
// selector MUST include a tag, but otherwise must be any valid query selector
// func is the replacement function taking the args el and fragment and can modify the element by:
// * Modifying the first argument and return nothing
// * Return a completely new element, which may be a subview's el
// * Modify the element and add siblings using the documentFragment provided as the second argument
// NOTES:
// * If replacing an element the old one may still be around with bindings and even as a property through this if an #id is used - be very aware of what the replacement is doing
// * DO NOT replace any root elements in a view's el layout
// * If the element is the root element for a view and the documentfragment is returned, the remove function will not work properly because the view's el becomes an empty documentfragment
Backbone.Cord.addReplacement = function(selector, func) {
	var tag = selector.split(' ')[0].split('[')[0].split('.')[0].split('#')[0];
	if(!_replacementTags[tag])
		_replacementTags[tag] = [];
	_replacementTags[tag].push({selector: selector, func: func});
};

Backbone.Cord.plugins.push({
	name: 'replacement',
	complete: function(context) {
		var el, i, replacement, replacements;
		if(context.subview)
			return;
		el = context.el;
		replacements = _replacementTags[el.tagName.toLowerCase()];
		if(replacements) {
			var fragment = document.createDocumentFragment();
			fragment.appendChild(el);
			for(i = 0; i < replacements.length; ++i) {
				replacement = replacements[i];
				if(fragment.querySelector(replacement.selector) === el)
					return replacement.func.call(this, el, fragment) || fragment;
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
