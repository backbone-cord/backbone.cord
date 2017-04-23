;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var mixObj = Cord.mixObj;

var namedPart = /(\(\?)?:\w+/g;
var splatPart = /\*\w+/g;
var normalPart = /\w+/g;

Cord.Router = Backbone.Router.extend({
	route: function(route, name, callback)  {
		var i, match, part, parts = route.split('/');
		var key = this.key;
		var components = {};
		var params = {};
		for(i = 0; i < parts.length; ++i) {
			part = parts[i];
			if(!part.length)
				continue;
			match = part.match(namedPart) || part.match(splatPart);
			if(match) {
				params[i] = match[0].substr(1);
			}
			else {
				match = part.match(normalPart);
				if(match) {
					components[key] = match[0];
					key = 'sub' + key;
				}
			}
		}
		if(typeof name === 'function') {
			callback = name;
			name = '';
		}
		return Backbone.Router.prototype.route.call(this, route, name, this.wrapCallback(name, callback, components, params));
	},
	wrapCallback: function(name, callback, components, params) {
		// components is a mapping of keys: component values, params is a mapping of argument index positions (0, 1, 2 etc.) to key names
		return function() {
			var i, values = {};
			var model = Cord.UnmanagedScopes.route;
			var existingKeys = Object.keys(model.attributes);
			// null all current values
			for(i = 0; i < existingKeys.length; ++i)
				values[existingKeys[i]] = null;
			// set the name of the current route
			values.name = name || '';
			// add in the named params of the route - unmatched params are null, also appears last argument is also null
			for(i = 0; i < arguments.length; ++i) {
				if(arguments[i] !== null)
					values[params[i]] = arguments[i];
			}
			// add in the components of the path
			values = mixObj(values, components);
			// invoke observers by setting the model and then do the callback if provided
			model.set(values);
			if(callback)
				return callback.apply(this, arguments);
		};
	}
});

Cord.plugins.push({ name: 'router', requirements: ['unmanagedscopes'] });

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
