;(function(root) {
'use strict';

var Backbone = root.Backbone || require('backbone');
var compatibilityMode = root.cordCompatibilityMode;
var requestAnimationFrame = root.requestAnimationFrame || setTimeout;

function _plugin(name, context) {
	// For each callbacks, call and return false if false is returned
	// Context object to communicate data between plugins and callbacks
	var callbacks = Backbone.Cord._callbacks[name];
	var args = Array.prototype.slice.call(arguments, 1);
	delete context[name];
	for(var i = 0; i < callbacks.length; ++i) {
		context[name] = callbacks[i].apply(this, args) || context[name];
	}
	return context[name];
}

// Generate an arbitrary DOM node given a tag[id][classes] string, [attributes] dictionary, and [child nodes...]
// If #id is given it must appear before the .classes, e.g. #id.class1.class2 or span#id.class1.class2
function _el(tagIdClasses, attrs) {
	tagIdClasses = tagIdClasses.split('.');
	var context = { isView: this instanceof Backbone.View };
	var tagId = tagIdClasses[0].split('#');
	var tag = tagId[0] ? tagId[0] : 'div';
	var el = context.el = this._plugin('tag', context, tag) || document.createElement(tag);
	var id = context.id = tagId[1];
	if(id)
		Backbone.Cord.setId(el, id);
	var classes = tagIdClasses.slice(1);
	classes = this._plugin('classes', context, classes) || classes;
	if(classes.length)
		el.className = classes.join(' ');
	if(arguments.length > 1) {
		// If attrs is not the start of children, then apply the dictionary as attributes
		var i = 1;
		if(!(typeof attrs === 'string' || attrs instanceof Backbone.View || attrs instanceof Node)) {
			i = 2;
			// Copy attrs to prevent side-effects
			attrs = JSON.parse(JSON.stringify(attrs));
			attrs = this._plugin('attrs', context, attrs) || attrs;
			for(var attr in attrs) {
				if(attrs.hasOwnProperty(attr))
					el.setAttribute(attr, attrs[attr]);
			}
		}
		// Copy arguments to prevent side-effects
		var child, children = Array.prototype.slice.call(arguments, i);
		children = this._plugin('children', context, children) || children;
		for(i = 0; i < children.length; ++i) {
			child = children[i];
			if(typeof child === 'string')
				el.appendChild(document.createTextNode(child));
			else if(child instanceof Backbone.View)
				el.appendChild(child.el);
			else
				el.appendChild(child);
		}
	}
	if(Backbone.Cord.config.idProperties && context.isView && id && Backbone.Cord.regex.testIdProperty(id)) {
		Object.defineProperty(this, id, {
			get: function() { return this.getChildById(id); },
			enumerable: true,
			configurable: false
		});
	}
	return this._plugin('complete', context) || el;
}

// A simple event callback, where the last argument is taken as a value to pass into setValueForKey
function _createSetValueCallback(key) {
	return function() {
		this.setValueForKey(key, arguments[arguments.length - 1]);
	};
}

// id and classes on the subview are maintained, but recommended that id is set by the parent view
function _subview(instanceClass, idClasses, bindings) {
	var id, classes, subview, context;
	if(!(instanceClass instanceof Backbone.View))
		subview = new instanceClass();
	else
		subview = instanceClass;
	// Init the subview's model - blocking the _invokeObservers method to prevent unnecessary observer invocations
	if(this.model !== Backbone.Cord.EmptyModel && subview.model === Backbone.Cord.EmptyModel && !subview.collection && subview instanceof Backbone.Cord.View) {
		subview._invokeObservers = function() {};
		if(!subview.cascade || subview.cascade(this.model) !== false)
			subview.setModel(this.model);
		delete subview._invokeObservers;
	}
	// Create the plugin context - isView should always be true, this method should never be called any other way
	context = { el: subview.el, isView: this instanceof Backbone.View, subview: subview };
	if(!context.isView)
		throw new Error('Attempting to create a subview without a parent.');
	if(typeof idClasses === 'string') {
		idClasses = idClasses.split('.');
		id = context.id = idClasses[0].substr(1);
		if(id && !Backbone.Cord.hasId(subview.el))
			Backbone.Cord.setId(subview.el, id);
		classes = idClasses.slice(1);
		classes = this._plugin('classes', context, classes) || classes;
		if(classes.length) {
			classes.unshift(subview.el.className);
			subview.el.className = classes.join(' ');
		}
	}
	else {
		bindings = idClasses;
	}
	if(bindings) {
		// Copy bindings to prevent side-effects
		bindings = JSON.parse(JSON.stringify(bindings));
		bindings = this._plugin('bindings', context, bindings) || bindings;
		for(var e in bindings) {
			if(bindings.hasOwnProperty(e))
				this.listenTo(subview, e, this[bindings[e]] || _createSetValueCallback(bindings[e]));
		}
	}
	subview.sid = Backbone.Cord._sid;
	Backbone.Cord._sid += 1;
	subview.el.setAttribute('data-sid', subview.sid);
	this.subviews[subview.sid] = subview;
	this.listenToOnce(subview, 'remove', function(subview) {
		this.stopListening(subview);
		delete this.subviews[subview.sid];
	});
	// Simply returns getSubviewById so that the property doesn't have another strong reference to the view that would also need to be cleaned up
	if(Backbone.Cord.config.idProperties && context.isView && id && Backbone.Cord.regex.testIdProperty(id)) {
		Object.defineProperty(this, id, {
			get: function() { return this.getSubviewById(id); },
			set: function(value) {
				var el, current;
				if(!(value instanceof Backbone.View))
					throw new Error('Attempting to assign a non-Backbone.View to a subview.');
				// Add the new subview and remove the old from the DOM
				el = value.el;
				current = this.getSubviewById(id);
				current.el.parentNode.insertBefore(el, current.el);
				current.remove();
				// If the new subview doesn't have an sid it needs to get setup, but without idClasses or bindings
				if(!value.sid)
					this._subview(value);
				// Reapply the id
				if(id && !Backbone.Cord.hasId(el))
					Backbone.Cord.setId(el, id);
			},
			enumerable: true,
			configurable: false
		});
	}
	this._plugin('complete', context);
	return subview;
}

Backbone.Cord = {
	VERSION: '1.0.8',
	config: {
		idProperties: true,
		oncePrefix: '%',
		notPrefix: '!',
		filterSeparator: '|'
	},
	regex: {
		idPropertyTest: /^[a-zA-Z_$][0-9a-zA-Z_$]*$/,
		idSelectorValues: /#([a-zA-Z_$][0-9a-zA-Z_$]*)/g
	},
	// Plugins install themselves by pushing to this array
	plugins: [],
	// Filters installed by the app by setting keys on this object
	filters: {},
	convertToString: function(obj) { if(obj === null || obj === undefined) return ''; return obj.toString(); },
	convertToBool: function(value) { return !!(value && (value.length === void(0) || value.length)); },
	// Initialize the Cord View class depending on the compatibility mode
	View: compatibilityMode ? Backbone.View.extend({}) : Backbone.View,
	// EmptyModel and EmptyView to use as default model and a subview placeholder
	EmptyModel: new (Backbone.Model.extend({set: function() { return this; }, toString: function() { return ''; }}))(),
	EmptyView: Backbone.View.extend({ tagName: 'meta' }),
	// Unique internal subview id, this unifies how subviews with and without ids are stored
	_sid: 1,
	_pluginsChecked: false,
	_el: _el,
	_subview: _subview,
	_plugin: _plugin,
	_scopes: {},
	// NOTE: classes, attrs, children, and bindings are all copies and may be modified by plugins without side-effects
	// modifications will be recognized by the default behavior and returning the copy is not necessary
	_callbacks: {
		// (el) tag can process the tag value and return an element overriding the default createElement
		tag: [],
		// (el and subview) classes is an array of classname, returning [] will prevent default classes being applied
		classes: [],
		// (el conditionally invoked) attrs is a dict, returning {} will prevent default attrs being applied
		attrs: [],
		// (el conditionally invoked) children is an array of strings or dom elements
		children: [],
		// (subview) bindings that by default get converted to event listeners
		bindings: [],
		// (el and subview) when creation and setup is complete, right before el and subview return, returning a different element can replace an el
		complete: [],
		// (new View) create, initialize, and remove apply to all views
		create: [],
		initialize: [],
		remove: [],
		// plugin callback to be used adhoc for processing strings from other plugins
		strings: []
	}
};
if(typeof exports === 'object')
	module.exports = Backbone.Cord;

Backbone.Cord.hasId = function(el) {
	return !!el.id;
};
Backbone.Cord.setId = function(el, id) {
	el.id = id;
};
Backbone.Cord.regex.replaceIdSelectors = function(query) {
	return query;
};
Backbone.Cord.regex.testIdProperty = function(id, noThrow) {
	var result = this.idPropertyTest.test(id);
	if(!result && !noThrow)
		throw new Error('Invalid id "' + id + '" used');
	return result;
};
function _escapeRegExp(str) { return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&'); }
function _regexPropertyDescriptor(name) {
	var search = name + 'Search';
	var value = name + 'Value';
	name = '_' + name;
	return {
		get: function() { return this[name]; },
		set: function(format) {
			this[name] = format;
			this[search] = new RegExp(_escapeRegExp(format.prefix) + '.*?' + _escapeRegExp(format.suffix), 'g');
			this[value] = new RegExp(_escapeRegExp(format.prefix) + '\\s*(.*?)\\s*' + _escapeRegExp(format.suffix));
		}
	};
}
Object.defineProperties(Backbone.Cord.regex, {
	variable: _regexPropertyDescriptor('variable'),
	conditional: _regexPropertyDescriptor('conditional'),
	expression: _regexPropertyDescriptor('expression')
});
Backbone.Cord.regex.variable = {prefix: '{', suffix: '}'};
Backbone.Cord.regex.conditional = {prefix: '(', suffix: ')'};
Backbone.Cord.regex.expression = {prefix: ':=', suffix: '=:'};

Backbone.Cord.plugins._check = function() {
	var i, j, plugin, loaded = {};
	for(i = 0; i < this.length; ++i)
		loaded[this[i].name] = true;
	for(i = 0; i < this.length; ++i) {
		plugin = this[i];
		if(plugin.requirements) {
			for(j = 0; j < plugin.requirements.length; ++j)
				if(!loaded[plugin.requirements[j]])
					throw new Error('Backbone.Cord plugin "' + plugin.name + '" requires missing plugin "' + plugin.requirements[j] + '"');
		}
	}
};
Backbone.Cord.plugins._register = function(plugin, fnc) {
	// Copy all of the default config settings
	if(plugin.config) {
		for(var setting in plugin.config) {
			if(plugin.config.hasOwnProperty(setting) && !Backbone.Cord.config.hasOwnProperty(setting))
				Backbone.Cord.config[setting] = plugin.config[setting];
		}
	}
	// Push references to all of the callback methods
	for(var callback in Backbone.Cord._callbacks) {
		if(Backbone.Cord._callbacks.hasOwnProperty(callback) && typeof plugin[callback] === 'function')
			fnc.call(Backbone.Cord._callbacks[callback], plugin[callback]);
	}
	// Register a variable scope
	if(plugin.scope)
		Backbone.Cord._scopes[plugin.name] = plugin.scope;
	return fnc.call(this, plugin);
};
Backbone.Cord.plugins.unshift = function(plugin) {
	return this._register(plugin, Array.prototype.unshift);
};
Backbone.Cord.plugins.push = function(plugin) {
	return this._register(plugin, Array.prototype.push);
};

// Expose _el on the View object as well
// _plugin is added because this._plugin is used for callbacks
Backbone.Cord.View.prototype._el = _el;
Backbone.Cord.View.prototype._subview = _subview;
Backbone.Cord.View.prototype._plugin = _plugin;
Backbone.Cord.View.prototype._getProperty = function(key) {
	return this['_' + key];
};
Backbone.Cord.View.prototype._setProperty = function(key, value) {
	this['_' + key] = value;
};
Backbone.Cord.View.prototype._synthesizeGetter = function(key) {
	key = '_' + key;
	return function() { return this[key]; };
};
Backbone.Cord.View.prototype._synthesizeSetter = function(key) {
	key = '_' + key;
	return function(value) { this[key] = value; };
};
// Synthesize and define a property using a simple definition, which is one more of (get, set, value), set: null creates a readonly property
// When definition is a function it implies {get: definition, set: null}
// When definition is just a value it implies {value: definition} - plain objects need to be explicity set under the value key
// When get or set is missing default accessors that read/write the backing _key are used
Backbone.Cord.View.prototype._synthesizeProperty = function(key, definition) {
	var value = null;
	var descriptor = { configurable: true, enumerable: true };
	if(typeof definition === 'function') {
		descriptor.get = definition;
	}
	else if(typeof definition !== 'object' || Object.getPrototypeOf(definition) !== Object.prototype) {
		value = definition;
	}
	else {
		value = definition.value;
		descriptor.get = definition.get;
		descriptor.set = definition.set;
	}
	descriptor.get = descriptor.get || this._synthesizeGetter(key);
	descriptor.set = (descriptor.set === null) ? void(0) : descriptor.set || this._synthesizeSetter(key);
	Object.defineProperty(this, key, descriptor);
	this._setProperty(key, value);
};
Backbone.Cord.View.prototype._modelObserver = function(model, options) {
	var key, changed = options._changed || model.changedAttributes();
	if(!changed)
		return;
	for(key in changed) {
		if(changed.hasOwnProperty(key))
			this._invokeObservers(key, changed[key]);
	}
};

// Do not modify the array or dictionary returned from this method, they may sometimes simply be an empty return value
Backbone.Cord.View.prototype._getObservers = function(newKey, scope) {
	var observers;
	if(scope)
		observers = this._observers[scope] || {};
	else
		observers = this._modelObservers;
	if(newKey)
		observers = observers[newKey] || [];
	return observers;
};
Backbone.Cord.View.prototype._invokeObservers = function(newKey, value, scope) {
	console.log(newKey + ' | ' + value + ' | ' + scope);
	var i, observers = this._getObservers(newKey, scope);
	for(i = 0; i < observers.length; ++i)
		observers[i].call(this, newKey, value);
	return this;
};

function _applyFilters(func, filters) {
	return function(newKey, val) {
		for(var i = 0; i < filters.length; ++i)
			val = filters[i](val);
		return func.call(this, newKey, val);
	};
}

Backbone.Cord.View.prototype.observe = function(key, observer, immediate) {
	var name, immediateCallback, newKey, found, scope, scopes, observers;
	if(typeof observer === 'string')
		observer = this[observer];
	if(!observer)
		return this;
	scopes = Backbone.Cord._scopes;
	// Apply any filters to the observer function
	if(key.indexOf(Backbone.Cord.config.filterSeparator) !== -1) {
		var i, filters = [], names = key.split(Backbone.Cord.config.filterSeparator);
		key = names[0].trim();
		for(i = 1; i < names.length; ++i)
			filters.push(Backbone.Cord.filters[names[i].trim()]);
		observer = _applyFilters(observer, filters);
	}
	// If key starts with oncePrefix, just do an immediate timeout with the getValue
	// not compatible with the notPrefix and doesn't include the key on callback
	if(key.indexOf(Backbone.Cord.config.oncePrefix) === 0) {
		key = key.substr(Backbone.Cord.config.oncePrefix.length);
		requestAnimationFrame(function() { observer.call(this, null, this.getValueForKey.call(this, key)); }.bind(this));
		return this;
	}
	// If key starts with notPrefix, apply a not wrapper to the observer function
	if(key.indexOf(Backbone.Cord.config.notPrefix) === 0) {
		var prevObserver = observer;
		key = key.substr(Backbone.Cord.config.notPrefix.length);
		observer = function(key, value) { prevObserver.call(this, key, !Backbone.Cord.convertToBool(value)); };
	}
	// For each scope plugin, stop and observe when an observe method callback returns a string
	if(immediate)
		immediateCallback = function(key, name) { observer.call(this, key, name ? scopes[name].getValue.call(this, key) : this.model.get(key)); };
	for(name in scopes) {
		if(scopes.hasOwnProperty(name)) {
			scope = scopes[name];
			newKey = scope.getKey.call(this, key);
			if(typeof newKey === 'string') {
				key = newKey;
				scope.observe.call(this, key, observer, immediate);
				if(!this._observers[name])
					this._observers[name] = {};
				observers = this._observers[name];
				found = true;
				break;
			}
		}
	}
	// If no observers entry set, do model binding
	if(!found) {
		name = null;
		observers = this._modelObservers;
		if(key === 'id')
			key = this.model.idAttribute;
	}
	// Register the observer
	if(!observers[key])
		observers[key] = [];
	observers[key].push(observer);
	if(immediate)
		requestAnimationFrame(immediateCallback.bind(this, key, name));
	return this;
};
Backbone.Cord.View.prototype.unobserve = function(key, observer) {
	var newKey, name, observers, index, found, scope, scopes = Backbone.Cord._scopes;
	if(typeof observer === 'string')
		observer = this[observer];
	if(!observer)
		return this;
	for(name in scopes) {
		if(scopes.hasOwnProperty(name)) {
			scope = scopes[name];
			newKey = scope.getKey.call(this, key);
			if(typeof newKey === 'string') {
				key = newKey;
				observers = this._observers[name];
				found = true;
				break;
			}
		}
	}
	// If no observers entry set, do model unbinding
	if(!found) {
		observers = this._modelObservers;
		if(key === 'id')
			key = this.model.idAttribute;
	}
	index = observers[key].indexOf(observer);
	if(index !== -1)
		observers[key].splice(index, 1);
	if(!observers.length)
		delete observers[key];
	// Do the unobserve callback after removing the observer
	if(found)
		scope.unobserve.call(this, key, observer);
	return this;
};
Backbone.Cord.View.prototype.getValueForKey = function(key) {
	var newKey, name, scope, scopes = Backbone.Cord._scopes;
	for(name in scopes) {
		if(scopes.hasOwnProperty(name)) {
			scope = scopes[name];
			newKey = scope.getKey.call(this, key);
			if(typeof newKey === 'string')
				return scope.getValue.call(this, newKey);
		}
	}
	if(key === 'id')
		return this.model.id;
	return this.model.get(key);
};
Backbone.Cord.View.prototype.setValueForKey = function(key, value) {
	var newKey, name, scope, scopes = Backbone.Cord._scopes;
	for(name in scopes) {
		if(scopes.hasOwnProperty(name)) {
			scope = scopes[name];
			newKey = scope.getKey.call(this, key);
			if(typeof newKey === 'string') {
				scope.setValue.call(this, newKey, value);
				return this;
			}
		}
	}
	if(key === 'id')
		key = this.model.idAttribute;
	this.model.set(key, value);
	return this;
};

Backbone.Cord.View.prototype.getChildById = function(id) {
	return document.getElementById(id);
};
Backbone.Cord.View.prototype.getSubviewById = function(id) {
	var node = this.getChildById(id);
	if(node)
		return this.subviews[node.getAttribute('data-sid')];
	return null;
};

// setModel will change the model a View has and invoke any observers
// For best performance and results, models should normally be provided in the View's constructor - only use setModel to swap out an existing model
// A default empty model is provided so that Cord and plugins can always count on a model being available, making the logic a bit easier
// setModel is defined as a method and not a property because it would be too confusing to distinguish between the first set and later changes, this is more explicit
Backbone.Cord.View.prototype.model = Backbone.Cord.EmptyModel;
Backbone.Cord.View.prototype.setModel = function(newModel, noCascade) {
	var key, current, subview;
	if(this.model === newModel)
		return this;
	if(!newModel)
		newModel = Backbone.Cord.EmptyModel;
	if(!(newModel instanceof Backbone.Model))
		throw new Error('Attempting to assign a non-Backbone.Model to View.model.');
	current = this.model;
	this.model = newModel;
	this.stopListening(current);
	this.listenTo(this.model, 'change', this._modelObserver);
	// Detect the changes and invoke observers
	if(Object.keys(this._modelObservers).length) {
		// Invoke all observers if the model is the empty model
		if(this.model === Backbone.Cord.EmptyModel) {
			for(key in this._modelObservers) {
				if(this._modelObservers.hasOwnProperty(key))
					this._invokeObservers(key);
			}
		}
		else {
			this._modelObserver(this.model, {_changed: current.changedAttributes(this.model.attributes)});
		}
	}
	if(!noCascade) {
		for(key in this.subviews) {
			if(this.subviews.hasOwnProperty(key)) {
				subview = this.subviews[key];
				// Do not cascade if the subview is not a Cord View or is intercepted by a cascade method
				if(!(subview instanceof Backbone.Cord.View))
					continue;
				if(subview.cascade && subview.cascade(newModel) === false)
					continue;
				if(subview.model === current && !subview.collection)
					subview.setModel(newModel);
			}
		}
	}
	return this;
};

// setCollection provided as a convention for plugins to wrap
Backbone.Cord.View.prototype.setCollection = function(newCollection) {
	this.stopListening(this.collection);
	this.collection = newCollection;
	return this;
};

// Wrap _ensureElement to add a subviews array
var __ensureElement = Backbone.Cord.View.prototype._ensureElement;
Backbone.Cord.View.prototype._ensureElement = function() {
	if(!Backbone.Cord._pluginsChecked) {
		Backbone.Cord.plugins._check();
		Backbone.Cord._pluginsChecked = true;
	}
	// If model or collection is provided as a class in the prototype, then create a new instance
	// This ensures availability on creating the layout but the fetch will need to be started by the View
	var proto = Object.getPrototypeOf(this);
	if(typeof proto.collection === 'function')
		this.collection = new proto.collection();
	else if(typeof proto.model === 'function')
		this.model = new proto.model();
	this.subviews = {};
	this._observers = {};
	this._modelObservers = {};
	this._sharedObservers = {};
	// Run plugin create hooks
	this._plugin('create', {});
	// Synthesize any declared properties
	var key;
	if(this.properties) {
		var properties = this.properties;
		for(key in properties)
			if(properties.hasOwnProperty(key))
				this._synthesizeProperty(key, properties[key]);
	}
	// Bind the el method with prefixed args
	var isFun = (typeof this.el === 'function');
	if(isFun)
		this.el = this.el.bind(this, this._el.bind(this), this._subview.bind(this));
	// Start listening to the model
	if(this.model !== Backbone.Cord.EmptyModel)
		this.listenTo(this.model, 'change', this._modelObserver);
	// After creating the element add any given className
	var ret = __ensureElement.apply(this, Array.prototype.slice.call(arguments));
	if(this.className && isFun)
		this.el.className += (this.el.className.length ? ' ' : '') + this.className;
	// Run plugin initializers
	this._plugin('initialize', {});
	// Setup any declared observers
	if(this.observers) {
		var observers = this.observers;
		for(key in observers)
			if(observers.hasOwnProperty(key))
				this.observe(key, observers[key]);
	}
	return ret;
};

// Wrap the remove method to also process subviews and plugins
var __remove = Backbone.Cord.View.prototype.remove;
Backbone.Cord.View.prototype.remove = function() {
	var key;
	this._plugin('remove', {});
	for(key in this.subviews) {
		if(this.subviews.hasOwnProperty(key))
			this.subviews[key].remove();
	}
	this.subviews = null;
	// Previously, a backwards loop called unobserve for each observer, but unobserve does not do any extra needed cleanup, so just set null
	// e.g. for(i = this._observers[key].length - 1; i >= 0; --i) this.unobserve(...);
	this._observers = null;
	this._modelObservers = null;
	this._sharedObservers = null;
	this.trigger('remove', this);
	return __remove.apply(this, Array.prototype.slice.call(arguments));
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)));
