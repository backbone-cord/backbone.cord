;(function(Backbone) {
'use strict';

var _replacementTags = {};

function _getSelectorTag(selector) {
	return selector.split(' ')[0].split('[')[0].split('.')[0].split('#')[0].toLowerCase();
}

// Each replacement function is function(el, parent), where:
// * the el is augmented inside the parent (a document fragment)
// * or a new element is returned, replacing el inside it's parent
// selector MUST include a tag, but otherwise must be any valid query selector
// func is the replacement function taking the args el and fragment and can modify the element by:
// * Modifying the first argument and return nothing
// * Modifying the element and add siblings using the documentFragment provided as the second argument and return nothing
// * Return a completely new element, which may be a subview's el
// NOTES:
// * If replacing an element the old one may still be around with bindings and even as a property through this if an #id is used - be very aware of what the replacement is doing
// * DO NOT replace any root elements in a view's el layout
// * If the element is the root element for a view and the documentfragment is returned, the remove function will not work properly because the view's el becomes an empty documentfragment
function _addReplacement(selector, func) {
	if(typeof selector === 'object') {
		var replacements = selector;
		for(selector in replacements) {
			if(replacements.hasOwnProperty(selector))
				_addReplacement(selector, replacements[selector]);
		}
		return;
	}
	var tag = _getSelectorTag(selector);
	if(!_replacementTags[tag])
		_replacementTags[tag] = [];
	_replacementTags[tag].push({selector: selector, func: func});
}

// Compile replacement functions local to the view only not global
// Works well for a mixin or parent class that needs to control how the subclass creates elements
// The compiled replacements cannot be mixed with other compiled replacements if there is a conflict in selector tags
function _compileReplacements(replacements) {
	var selector, tag, func, compiled = {};
	for(selector in replacements) {
		if(replacements.hasOwnProperty(selector)) {
			tag = _getSelectorTag(selector);
			func = replacements[selector];
			if(!compiled[tag])
				compiled[tag] = [];
			compiled[tag].push({selector: selector, func: func});
		}
	}
	return compiled;
}

Backbone.Cord.Replacements = {
	add: _addReplacement,
	compile: _compileReplacements
};

Backbone.Cord.plugins.push({
	name: 'replacement',
	config: {
		noReplaceAttribute: 'noreplace'
	},
	complete: function(context) {
		var el, i, tag, local, replacements, replacement, fragment, result;
		if(context.subview)
			return;
		el = context.el;
		if(el.hasAttribute(Backbone.Cord.config.noReplaceAttribute)) {
			el.removeAttribute(Backbone.Cord.config.noReplaceAttribute);
			return;
		}
		tag = el.tagName.toLowerCase();
		replacements = _replacementTags[tag];
		local = this.replacements && this.replacements[tag];
		if(local && replacements)
			replacements = local.concat(replacements);
		else
			replacements = replacements || local;
		if(replacements) {
			fragment = document.createDocumentFragment();
			fragment.appendChild(el);
			for(i = 0; i < replacements.length; ++i) {
				replacement = replacements[i];
				if(fragment.querySelector(replacement.selector) === el) {
					// Perform the replacement and persist any given id
					result = replacement.func.call(this, el, fragment) || fragment;
					if(result.nodetype !== Node.DOCUMENT_FRAGMENT_NODE && Backbone.Cord.hasId(el))
						Backbone.Cord.setId(result, Backbone.Cord.getId(el), this.vuid);
					return result;
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
