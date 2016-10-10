;(function(Backbone) {
'use strict';

// Overwrite Cord's getChildById
var __getChildById = Backbone.Cord.View.prototype.getChildById;
Backbone.Cord.View.prototype.getChildById = function(id) {
	return this.el.querySelector('[data-id="' + id +  '"]') || __getChildById.call(this, id);
};

// Overwrite Cord's id processing methods
Backbone.Cord.hasId = function(el) {
	return !!el.getAttribute('data-id');
};
Backbone.Cord.getId = function(el) {
	return el.getAttribute('data-id');
};
Backbone.Cord.setId = function(el, id) {
	el.setAttribute('data-id', id);
};
Backbone.Cord.regex.replaceIdSelectors = function(query) {
	return query.replace(this.idSelectorValues, '[data-id="$1"]');
};

// Using this plugin is strongly recommended and required if mixing with non-code Backbone views that have their own unique id attributes
// data-id works on the principle that views are reusable and composable, so the normal unique id attributes should not be used
// Also ensures that lookup by id methods work when mixed with any views that already set their own unique id attribute
// A View's events will get converted to data-id selectors from #id selectors
// jquery selectors will need to explicitly use data-id selectors but it is better practice to simply use id properties on the View
Backbone.Cord.plugins.push({
	name: 'dataid',
	extend: function(context) {
		// On extend alter any event delegation based on #id
		var key, value, events = context.protoProps.events;
		if(events) {
			for(key in events) {
				if(events.hasOwnProperty(key) && key.indexOf('#') !== -1) {
					value = events[key];
					delete events[key];
					key = Backbone.Cord.regex.replaceIdSelectors(key);
					events[key] = value;
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
