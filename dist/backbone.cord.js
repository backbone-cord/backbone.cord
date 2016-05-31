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
				// Reapply the id or remove the old property if a different id is used
				if(!Backbone.Cord.hasId(el))
					Backbone.Cord.setId(el, id);
				else if(id !== Backbone.Cord.getId(el))
					delete this[id];
			},
			enumerable: true,
			configurable: true
		});
	}
	this._plugin('complete', context);
	return subview;
}

Backbone.Cord = {
	VERSION: '1.0.9',
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
Backbone.Cord.getId = function(el) {
	return el.id;
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

;(function(Backbone) {
'use strict';

var _nodeProperties = {
	'innerHTML': true,
	'value': true,
	'checked': true
};

var _changeEventProperties = {
	'value': true,
	'checked': true
};

function _createAttrObserver(node, attr) {
	if(_nodeProperties[attr])
		return function(key, formatted) {
			if(attr === 'checked')
				node[attr] = Backbone.Cord.convertToBool(formatted);
			else
				node[attr] = Backbone.Cord.convertToString(formatted);
			if(Backbone.Cord.config.bindingDispatchChangeEvents && _changeEventProperties[attr]) {
				var evt = document.createEvent('HTMLEvents');
				evt.initEvent('change', true, true);
				node.dispatchEvent(evt);
			}
		};
	else
		return function(key, formatted) {
			node.setAttribute(attr, Backbone.Cord.convertToString(formatted));
		};
}

function _createChildObserver(node) {
	return function(key, value) {
		node.textContent = Backbone.Cord.convertToString(value);
	};
}

var _valueDecoders = {
	'range': function(el) { return parseInt(el.value); },
	'number': function(el) { return Number(el.value); },
	'integer': function(el) { return parseInt(el.value); },
	'decimal': function(el) { return parseFloat(el.value); },
	'date': function(el) { return new Date(el.value); },
	'datetime': function(el) { return new Date(el.value); },
	'checkbox': function(el) { return el.checked; }
};

function _createValueListener(key) {
	return function(e) {
		var el = e.currentTarget;
		var decoder = _valueDecoders[el.getAttribute('data-type') || el.getAttribute('type')];
		this.setValueForKey(key, decoder ? decoder.call(this, el) : el.value);
	};
}

Backbone.Cord.plugins.push({
	name: 'binding',
	requirements: ['interpolation'],
	config: {
		bindingDispatchChangeEvents: true
	},
	attrs: function(context, attrs) {
		var format, listener, expectChange;
		if(!context.isView)
			return;
		for(var attr in attrs) {
			if(attrs.hasOwnProperty(attr)) {
				format = attrs[attr];
				if(typeof format === 'string' && format.match(Backbone.Cord.regex.variableSearch)) {
					this.observeFormat(format, _createAttrObserver(context.el, attr), true);
					if(Backbone.Cord.config.bindingDispatchChangeEvents && _changeEventProperties[attr])
						expectChange = true;
					delete attrs[attr];
				}
			}
		}
		// Reverse binding on change or input events
		if(attrs.change) {
			listener = _createValueListener(attrs.change).bind(this);
			context.el.addEventListener('change', listener);
			delete attrs.change;
		}
		if(attrs.input) {
			listener = _createValueListener(attrs.input).bind(this);
			context.el.addEventListener('input', listener);
			delete attrs.input;
		}
		// Invoke the reverse listener with the initial value if an initial change event is not expected from an attribute observer
		if(listener && !expectChange)
			setTimeout(listener, 0, {currentTarget: context.el});
	},
	children: function(context, children) {
		var i, j, child, strings, matches, spliceArgs, node;
		if(!context.isView)
			return;
		for(i = children.length - 1; i >= 0; --i) {
			child = children[i];
			if(typeof child === 'string') {
				strings = child.split(Backbone.Cord.regex.variableSearch);
				if(strings.length > 1) {
					spliceArgs = [i, 1];
					matches = child.match(Backbone.Cord.regex.variableSearch);
					for(j = 0; j < matches.length; ++j) {
						if(strings[j].length)
							spliceArgs.push(document.createTextNode(strings[j]));
						node = document.createTextNode('');
						this.observe(Backbone.Cord.regex.variableValue.exec(matches[j])[1], _createChildObserver(node), true);
						spliceArgs.push(node);
					}
					if(strings[j].length)
						spliceArgs.push(document.createTextNode(strings[j]));
					Array.prototype.splice.apply(children, spliceArgs);
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

function _setLength() {
	// Ignore any value given and just use the collection's length
	this._length = this.collection.length;
}

function _getStart() {
	return this._start + 1;
}

function _getEnd() {
	return this._end + 1;
}

function _setStart(value) {
	// Ignore any value given and calculate only when given a value of -1 internally from _updateCalculated()
	var start = 0;
	if(value !== -1)
		return;
	if(this._pageStart > 0)
		start = this._pageStart;
	if(start > this._length)
		start = this._length;
	if(!this._pageLength)
		start = 0;
	this._start = start;
}

function _setEnd(value) {
	// Ignore any value given and calculate only when given a value of -1 internally from _updateCalculated()
	var end = this._length - 1;
	if(value !== -1)
		return;
	if(this._pageLength > 0)
		end = this._start + this._pageLength - 1;
	if(end >= this._length)
		end = this._length - 1;
	if(!this._pageLength)
		end = -1;
	this._end = end;
}

function _setMore(value) {
	if(value !== -1)
		return;
	this._more = this._length - (this._end + 1);
}

function _updateCalculated() {
	// Invoke all set methods for calculations - called from add, remove, and reset methods and indirectly when paging is updated
	this.length = 0;
	this.start = -1;
	this.end = -1;
	this.more = -1;
}

function _setPageStart(value) {
	// Note: Setting pageStart to something >= collection.length, will cause start to be collection.length and end collection.length - 1
	if(this._pageStart === value)
		return;
	this._pageStart = value;
	_resetNodes.call(this);
}

function _setPageLength(value) {
	// Note: Setting pageLength to 0 will cause end to be -1
	if(this._pageLength === value)
		return;
	this._pageLength = value;
	_resetNodes.call(this);
}

function _setSelected(model) {
	var currentView;
	if(this._selected === model)
		return;
	this._selected = model;
	this.setModel(model);
	this.trigger('select', model);
	currentView = this.itemViews._selected;
	if(currentView)
		currentView.selected = false;
	if(model) {
		currentView = this.itemViews[model.cid];
		this.itemViews._selected = currentView;
		currentView.selected = true;
	}
	else {
		delete this.itemViews._selected;
	}
}

function _getContainer() {
	// Look for a child with the container id, but default to the view's el
	return this.getChildById(Backbone.Cord.config.collectionContainerId) || this.el;
}

function _createNode(model) {
	var view = new this.itemView({model: model});
	if(view.sid)
		throw new Error('Item views cannot be passed or created through the subview() method.');
	// Listen to select events from itemView, which will proxy trigger a select even on this view
	this.listenTo(view, 'select', _setSelected);
	this.itemViews[view.model.cid] = view;
	return view;
}

function _sortNodes() {
	var i, key, model, view, child, container;
	container = _getContainer.call(this);
	if(!container || !this._length)
		return;
	if(this._start === 0 && this._end === this._length - 1) {
		// There is no paging, all items are already in the DOM, just need to reorder the items
		child = this.itemViews._first.el;
		for(i = 0; i < this._length; ++i) {
			model = this.collection.at(i);
			view = this.itemViews[model.cid];
			container.insertBefore(view.el, child);
			child = view.el.nextSibling;
		}
		this.itemViews._first = this.itemViews[this.collection.at(0).cid];
	}
	else {
		var itemRemoval = {}; // Copy of hash of model ids, that get removed as resused
		var keys = Object.keys(this.itemViews);
		for(i = 0; i < keys.length; ++i)
			itemRemoval[keys[i]] = true;
		itemRemoval._first = false;
		itemRemoval._selected = false;
		// Create or flag existing views for reuse
		for(i = this._start; i <= this._end; ++i) {
			key = this.collection.at(i).cid;
			if(this.itemViews[key])
				itemRemoval[key] = false;
			else
				this.itemViews[key] = _createNode.call(this, this.collection.at(i));
		}
		// Loop over itemRemoval and remove views
		for(key in itemRemoval) {
			if(itemRemoval.hasOwnProperty(key) && itemRemoval[key]) {
				view = this.itemViews[key];
				if(this._selected === view.model)
					this.selected = null;
				delete this.itemViews[key];
				this.stopListening(view);
				view.remove();
			}
		}
		// Loop over the models and pull from new and existing views
		for(i = this._start; i <= this._end; ++i) {
			view = this.itemViews[this.collection.at(i).cid];
			container.appendChild(view.el);
		}
		this.itemViews._first = this.itemViews[this.collection.at(this._start).cid];
	}
}

function _addNode(model, collection, options) {
	var view, container, sibling, index;
	_updateCalculated.call(this);
	container = _getContainer.call(this);
	if(!container)
		return;
	index = options.index === void(0) ? this._length - 1 : options.index;
	// If the index does not fall between start and end, then return
	if(index < this._start || index > this._end)
		return;
	// Normalize the index to the page
	index = index - this._start;
	// If the page is full and will overflow, remove the last child
	if((this._end - this._start) + 1 === this._pageLength)
		container.removeChild(container.lastChild);
	view = _createNode.call(this, model);
	if(index === this._end) {
		container.appendChild(view.el);
	}
	else {
		sibling = this.itemViews[collection.at(this._start + index + 1).cid].el;
		sibling.parentNode.insertBefore(view.el, sibling);
	}
	if(index === 0)
		this.itemViews._first = view;
}

function _removeNode(model, collection, options) {
	var view, container;
	var more = this._more;
	_updateCalculated.call(this);
	container = _getContainer.call(this);
	if(!container)
		return;
	if(this._selected === model)
		this.selected = null;
	view = this.itemViews[model.cid];
	if(view) {
		delete this.itemViews[model.cid];
		this.stopListening(view);
		view.remove();
		if(options.index >= this._start && options.index <= this._end && more) {
			// A new node needs to be added at the end of the page
			view = _createNode.call(this, collection.at(this._end));
			container.appendChild(view.el);
		}
		this.itemViews._first = this.itemViews[collection.at(this._start).cid];
	}
}

function _resetNodes() {
	// When resetting, no other add, remove, or update events are triggered
	var i, view, fragment, container;
	_removeAll.call(this);
	_updateCalculated.call(this);
	container = _getContainer.call(this);
	if(!container || !this._length)
		return;
	fragment = document.createDocumentFragment();
	for(i = this._start; i <= this._end; ++i) {
		view = _createNode.call(this, this.collection.at(i));
		if(i === this._start)
			this.itemViews._first = view;
		fragment.appendChild(view.el);
	}
	container.appendChild(fragment);
}

function _setup() {
	// Setup event listeners on the collection
	this.listenTo(this.collection, 'add', _addNode);
	this.listenTo(this.collection, 'remove', _removeNode);
	this.listenTo(this.collection, 'sort', _sortNodes);
	this.listenTo(this.collection, 'reset', _resetNodes);
}

function _removeAll() {
	// Cleanup and the second part of _setup() through _resetNodes() - where itemViews and selected gets initialized
	var cid, view;
	if(this.itemViews) {
		delete this.itemViews._first;
		delete this.itemViews._selected;
		for(cid in this.itemViews) {
			if(this.itemViews.hasOwnProperty(cid)) {
				view = this.itemViews[cid];
				this.stopListening(view);
				view.remove();
			}
		}
	}
	this.itemViews = {};
	this.selected = null;
}

function _getItemView(indexModelElement) {
	var key, cid;
	// First assume argument is a model
	cid = indexModelElement.cid;
	// Check for the argument for index, otherwise check for element
	if(typeof indexModelElement === 'number') {
		var model = this.collection.at(indexModelElement);
		if(model)
			cid = model.cid;
	}
	else if(indexModelElement.nodeType === 1) {
		for(key in this.itemViews) {
			if(this.itemViews.hasOwnProperty(key) && this.itemViews[key].el === indexModelElement) {
				cid = key;
				break;
			}
		}
	}
	return (cid ? this.itemViews[cid] : void(0));
}

var __setCollection = Backbone.Cord.View.prototype.setCollection;
Backbone.Cord.View.prototype.setCollection = function(newCollection) {
	if(this.collection === newCollection)
		return;
	var ret = __setCollection.call(this, newCollection);
	// Collections may change but a collection view must have collection from creation and cannot be later setup
	if(this.isCollectionView) {
		// If undefined or null is passed, substitute with an empty collection instead
		if(!newCollection)
			newCollection = new Backbone.Collection();
		_setup.call(this);
		_resetNodes.call(this);
	}
	return ret;
};

// The collection plugin manages item subviews for a collection, non-item subviews will be managed by Cord and when items are selected the model will be set on all of these subviews
// The model property will automatically be set with setModel() when select()/unselect() is called
// itemView: function(model) { return a subview but NOT using the subview method; subview management is different } only subviews are allowed for items not elements
// Binding {!_length} can be used to check for empty collection
// empty view is simply by using hidden for both _length and !_length
// How to create a selection view as a subview and as a sibling view?
// as a subview setModel will be called, but no way to determine empty model? maybe add field to empty model? or if this.model can be null need to define something under setModel?
// as sibling setModel after a select event on the parent
// NOTE - Not using update anymore - Requires 1.2.0 or greater for the update event
// Requires a container be defined with the id #container
Backbone.Cord.plugins.push({
	name: 'collection',
	config: {
		collectionContainerId: 'container'
	},
	create: function() {
		if(this.itemView) {
			if(!this.collection)
				this.collection = new Backbone.Collection();
			this.isCollectionView = true;
			this.getItemView = _getItemView;
			this._synthesizeProperty('length', {set: _setLength});
			this._synthesizeProperty('start', {get: _getStart, set: _setStart});
			this._synthesizeProperty('end', {get: _getEnd, set: _setEnd});
			this._synthesizeProperty('more', {set: _setMore});
			this._synthesizeProperty('pageStart', {set: _setPageStart, value: 0});
			this._synthesizeProperty('pageLength', {set: _setPageLength, value: -1});
			this._synthesizeProperty('selected', {set: _setSelected, value: null});
			// Setup, set initial calculated values, and then on next tick, run reset (not based on events to add loading, empty, or render)
			_setup.call(this);
			_updateCalculated.call(this);
			setTimeout(_resetNodes.bind(this), 0);
		}
	},
	remove: function() {
		if(this.isCollectionView && this.itemViews) {
			_removeAll.call(this);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

function _getFunctionArgs(func) {
	// Get all argument names for a function
	// Based on http://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically-from-javascript
	var str = func.toString();
	var args = str.slice(str.indexOf('(') + 1, str.indexOf(')')).match(/([^\s,]+)/g);
	if(!args)
		args = [];
	return args;
}

function _detectComputedChanges() {
	var i, key, keys;
	var change, changed = this.changedAttributes();
	var newChanged = {};
	for(change in changed) {
		if(changed.hasOwnProperty(change) && this._computedArgs[change]) {
			keys = this._computedArgs[change];
			for(i = 0; i < keys.length; ++i) {
				key = keys[i];
				if(!newChanged[key]) {
					newChanged[key] = this.get(key);
					this.trigger('change:' + key, this, newChanged[key], {});
				}
			}
		}
	}
	// To not interefer with the current change event, use setTimeout to modify the changed object
	setTimeout(function() {
		this.changed = newChanged;
		this.trigger('change', this, {});
	}.bind(this), 0);
}

function _wrapComputedFunc(func, args) {
	return function() {
		var i, values = [];
		for(i = 0; i < args.length; ++i)
			values.push(this.get(args[i]));
		return func.apply(this, values);
	};
}

// Extend computed attribute capabilities to Backbone models
Backbone.Model.prototype._addComputed = function(key, func) {
	var i, arg, args = _getFunctionArgs(func);
	if(!this._computed) {
		this._computed = {};
		this._computedArgs = {};
		this.get = function(attr) {
			var compFun = this._computed[attr];
			if(compFun)
				return compFun.call(this);
			return Backbone.Model.prototype.get.call(this, attr);
		};
		this.listenTo(this, 'change', _detectComputedChanges);
	}
	this._computed[key] = _wrapComputedFunc(func, args);
	for(i = 0; i < args.length; ++i) {
		arg = args[i];
		if(!this._computedArgs[arg])
			this._computedArgs[arg] = [];
		this._computedArgs[arg].push(key);
	}
};

// Wrap extend to wrap the initialize method
var __extend = Backbone.Model.extend;
Backbone.Model.extend = function(properties) {
	var __initialize;
	if(properties.computed) {
		__initialize = properties.initialize || Backbone.Model.prototype.initialize;
		properties.initialize = function() {
			if(this.computed) {
				for(var attr in this.computed) {
					if(this.computed.hasOwnProperty(attr))
						this._addComputed(attr, this.computed[attr]);
				}
			}
			return __initialize.apply(this, Array.prototype.slice.call(arguments));
		};
	}
	return __extend.apply(this, Array.prototype.slice.call(arguments));
};

function _createArgObserver(key, getFunc, args) {
	return function() {
		var i, values = [];
		for(i = 0; i < args.length; ++i)
			values.push(this.getValueForKey(args[i]));
		this[key] = getFunc.apply(this, values);
	};
}

Backbone.Cord.plugins.push({
	name: 'computed',
	initialize: function() {
		// Enumerate all of the get properties to determine which has a get method with arguments
		if(this.properties) {
			var key, prop, args, i, observer;
			for(key in this.properties) {
				if(this.properties.hasOwnProperty(key)) {
					prop = Object.getOwnPropertyDescriptor(this, key);
					if(prop && prop.get) {
						args = _getFunctionArgs(prop.get);
						if(args.length) {
							// The observer method then will call this._setKey(argValues...);
							observer = _createArgObserver(key, prop.get, args);
							for(i = 0; i < args.length; ++i)
								this.observe(args[i], observer, i === 0);
							// The get then needs to be replaced with a default getter
							Object.defineProperty(this, key, {get: this._synthesizeGetter(key)});
						}
					}
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

function _createObserver(el, cls) {
	return function(key, value) {
		var enabled = Backbone.Cord.convertToBool(value);
		var currentClasses = el.className.split(' ');
		var index = currentClasses.indexOf(cls);
		// Add or remove the classes
		if(enabled && index === -1)
			currentClasses.push(cls);
		else if(!enabled && index !== -1)
			currentClasses.splice(index, 1);
		el.className = currentClasses.join(' ');
	};
}

Backbone.Cord.plugins.push({
	name: 'conditionalclasses',
	classes: function(context, classes) {
		var matchInfo;
		if(!context.isView)
			return;
		for(var i = classes.length - 1; i >= 0; --i) {
			matchInfo = classes[i].match(Backbone.Cord.regex.conditionalValue);
			if(matchInfo) {
				var el = context.el;
				var cls = classes[i].substr(0, matchInfo.index);
				var key = matchInfo[1];
				this.observe(key, _createObserver(el, cls), true);
				classes.splice(i, 1);
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

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

// Wrap extend to alter any event delegation based on #id
var __extend = Backbone.Cord.View.extend;
Backbone.Cord.View.extend = function(properties) {
	var key, value;
	if(properties.events) {
		for(key in properties.events) {
			if(properties.events.hasOwnProperty(key) && key.indexOf('#') !== -1) {
				value = properties.events[key];
				delete properties.events[key];
				key = Backbone.Cord.regex.replaceIdSelectors(key);
				properties.events[key] = value;
			}
		}
	}
	return __extend.apply(this, Array.prototype.slice.call(arguments));
};

// Using this plugin is strongly recommended and required if mixing with non-code Backbone views that have their own unique id attributes
// data-id works on the principle that views are reusable and composable, so the normal unique id attributes should not be used
// Also ensures that lookup by id methods work when mixed with any views that already set their own unique id attribute
// A View's events will get converted to data-id selectors from #id selectors
// jquery selectors will need to explicitly use data-id selectors but it is better practice to simply use id properties on the View
// Plugin doesn't provide callbacks but register it anyways
Backbone.Cord.plugins.push({ name: 'dataid' });

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

function _createObserver(el) {
	var indicator = 'dynamic-class-' + Math.floor(Math.random() * 9999999);
	return function(key, formatted) {
		var classes = el.className.length ? el.className.split(' ') : [];
		var index = classes.indexOf(indicator);
		if(index !== -1) {
			classes[index + 1] = Backbone.Cord.convertToString(formatted);
		}
		else {
			classes.push(indicator);
			classes.push(Backbone.Cord.convertToString(formatted));
		}
		el.className = classes.join(' ');
	};
}

// Support for interpolated class names, such as div.{_red}-top
Backbone.Cord.plugins.push({
	name: 'dynamicclasses',
	requirements: ['interpolation'],
	classes: function(context, classes) {
		if(!context.isView)
			return;
		for(var i = classes.length - 1; i >= 0; --i) {
			if(classes[i].search(Backbone.Cord.regex.variableSearch) !== -1) {
				this.observeFormat(classes[i], _createObserver(context.el), true);
				classes.splice(i, 1);
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

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
		if(attr.substr(0, 2) === 'on' && attrs.hasOwnProperty(attr)) {
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

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

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

function _hidden(context, attrs) {
	if(!context.isView)
		return;
	if(attrs.hidden) {
		this.observe(attrs.hidden, _createObserver(context.el), true);
		delete attrs.hidden;
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

;(function(Backbone) {
'use strict';

function _createFormatObserver(strings, properties, formatObserver) {
	return function(key) {
		var i, property, formatted = [];
		for(i = 0; i < properties.length; ++i) {
			formatted.push(strings[i]);
			property = properties[i];
			formatted.push(this.getValueForKey(property));
		}
		formatted.push(strings[i]);
		formatObserver.call(this, key, formatted.join(''));
	};
}

Backbone.Cord.View.prototype.observeFormat = function(format, observer, immediate) {
	var strings = format.split(Backbone.Cord.regex.variableSearch);
	var matches = format.match(Backbone.Cord.regex.variableSearch);
	if(!matches)
		return;
	else if(matches.length === 1 && matches[0] === format) {
		this.observe(Backbone.Cord.regex.variableValue.exec(matches[0])[1], observer, immediate);
	}
	else {
		var observed = {};
		var i;
		for(i = 0; i < matches.length; ++i)
			matches[i] = Backbone.Cord.regex.variableValue.exec(matches[i])[1];
		for(i = 0; i < matches.length; ++i) {
			if(!observed[matches[i]]) {
				this.observe(matches[i], _createFormatObserver(strings, matches, observer), immediate);
				// Do not observe more than once per property and only do an immediate callback once
				observed[matches[i]] = true;
				immediate = false;
			}
		}
	}
};

// Plugin doesn't actually do anything but register it anyways
Backbone.Cord.plugins.push({ name: 'interpolation' });

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

function _createExpressionProperty(expr, prop) {
	var i, key;
	var strings = expr.split(Backbone.Cord.regex.variableSearch);
	var matches = expr.match(Backbone.Cord.regex.variableSearch);
	// Create the function used to set the expression value
	var code = 'this.' + prop + ' = ';
	for(i = 0; i < matches.length; ++i) {
		code += strings[i];
		key = matches[i] = Backbone.Cord.regex.variableValue.exec(matches[i])[1];
		code += 'Number(this.getValueForKey("' + key + '"))';
	}
	code += strings[i] + ';';
	/* jshint -W054 */
	var fnc = new Function(code);
	// Manually add observers for all the variables and get one immediate callback with !i
	for(i = 0; i < matches.length; ++i) {
		key = matches[i];
		this.observe(key, fnc, !i);
	}
	// Define the expression property and set enumarable to false
	this._synthesizeProperty(prop);
	Object.defineProperty(this, prop, {enumerable: false});
}

function _replaceExpressions(str) {
	var i, expr, prop, newStr;
	var strings = str.split(Backbone.Cord.regex.expressionSearch);
	var matches = str.match(Backbone.Cord.regex.expressionSearch);
	if(!matches)
		return str;

	for(i = 0; i < matches.length; ++i) {
		expr = Backbone.Cord.regex.expressionValue.exec(matches[i])[1];
		prop = 'expr' + Math.floor(Math.random() * 9999999);
		matches[i] = Backbone.Cord.regex.variable.prefix + Backbone.Cord.config.viewPrefix + prop + Backbone.Cord.regex.variable.suffix;
		_createExpressionProperty.call(this, expr, prop);
	}

	// Rejoin strings and matches
	newStr = '';
	for(i = 0; i < matches.length; ++i) {
		newStr += strings[i];
		newStr += matches[i];
	}
	newStr += strings[i];
	return newStr;
}

// Math needs to run first before other plugins because it changes bindings
Backbone.Cord.plugins.unshift({
	name: 'math',
	requirements: ['viewscope'],
	attrs: function(context, attrs) {
		if(!context.isView)
			return;
		for(var attr in attrs) {
			if(attrs.hasOwnProperty(attr) && typeof attrs[attr] === 'string' && Backbone.Cord.regex.expressionSearch.test(attrs[attr]))
				attrs[attr] = _replaceExpressions.call(this, attrs[attr]);
		}
	},
	children: function(context, children) {
		// Similar to binding, look for text children
		if(!context.isView)
			return;
		for(var i = 0; i < children.length; ++i) {
			if(typeof children[i] === 'string' && Backbone.Cord.regex.expressionSearch.test(children[i]))
				children[i] = _replaceExpressions.call(this, children[i]);
		}
	},
	strings: function(context, strings) {
		for(var str in strings) {
			if(strings.hasOwnProperty(str) && typeof strings[str] === 'string' && Backbone.Cord.regex.expressionSearch.test(strings[str]))
				strings[str] = _replaceExpressions.call(this, strings[str]);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

// One-way attribute(s) tracking
Backbone.Model.prototype.track = function(model, attrs, transform) {
	if(typeof attrs === 'function') {
		transform = attrs;
		attrs = null;
	}
	transform = transform || function(data) { return data; };
	if(!attrs) {
		this.listenTo(model, 'change', function(model, options) {
			if(!options._track) {
				options = JSON.parse(JSON.stringify(options));
				options._track = true;
				this.set(transform(model.attributes), options);
			}
		});
	}
	else {
		var createListener = function(attr) {
			return function(model, value, options) {
				var data = {};
				data[attr] = value;
				if(!options._track) {
					options = JSON.parse(JSON.stringify(options));
					options._track = true;
					this.set(transform(data), options);
				}
			};
		};
		if(typeof attrs === 'string')
			attrs = [attrs];
		for(var i = 0; i < attrs.length; ++i) {
			this.listenTo(model, 'change:' + attrs[i], createListener(attrs[i]));
		}
	}
	return this;
};

// Used for both subobjects and models that are transformed from others
// Submodels could be created on initialize like in the backbone docs
// Transformed modules could be created on the cascade method
Backbone.Model.prototype.subsume = function(cls, attr, transform) {
	var sub = new cls();
	if(typeof attr === 'function') {
		transform = attr;
		attr = null;
	}
	transform = transform || sub.transform || function(data) { return data; };
	// Proxy communication events
	sub.listenTo(this, 'request sync error', function() {
		this.trigger.apply(this, Array.prototype.slice.call(arguments));
	});
	// Perform the initial set and setup tracking
	if(attr) {
		if(Object.keys(this.get(attr)).length)
			sub.set(transform(sub.parse(this.get(attr))));
		sub.track(this, attr, function(data) { return data[attr]; });
		this.track(sub, function(data) { var attrs = {}; attrs[attr] = data; return attrs; });
	}
	else {
		if(Object.keys(this.attributes).length)
			sub.set(transform(sub.parse(this.attributes)));
		sub.track(this, transform);
	}
	return sub;
};

// Two-way tracking
Backbone.Model.prototype.mirror = function(model, attrs) {
	this.track(model, attrs);
	model.track(this, attrs);
	return this;
};

// Plugin doesn't actually do anything but register it anyways
Backbone.Cord.plugins.push({ name: 'modeltracking' });

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

function _getContainer() {
	// Look for a child with the container id, but default to the view's el
	return this.getChildById(Backbone.Cord.config.containerId) || this.el;
}

function _subview() {
	// Just add to a list of subviews for cleanup on next render
	var subview = this._subview.apply(this, Array.prototype.slice.call(arguments));
	this._renderedSubviews.push(subview);
	return subview;
}

function _once(func) {
	// Call the inner function but only once on the next tick
	var tid;
	return function() {
		if(!tid)
			tid = setTimeout(func);
	};
}

// Plugin to detect and wrap a render function if defined on a Cord View
// The render function, like the el function will have the _el and _subview method always given as the first two arguments
// The different is though that additional arguments can be given to the render function and they will be reused when automatic rerenders happen
// The render method must return a single element or subview or an array of mixed elements and subviews
// The returned value from render will then be placed into a documentFragment to be added to the DOM appended to the view's root el or a #container element if specified
// The new wrapped render function gets set on the view instance and can be given the additional arguments directly. e.g. render(arg1, arg2)
// The new wrapped render() method returns this, so that it can be chained
// The enw wrapped render() needs to be explicity called, it does not get called automatically unless some binding has changed within it
// NOTE: do not use reverse binding until more testing is done
Backbone.Cord.plugins.push({
	name: 'render',
	config: {
		containerId: 'container'
	},
	initialize: function() {
		if(this.render !== Backbone.View.prototype.render) {
			var __render = this.render.bind(this, this._el.bind(this), _subview.bind(this));
			this.render = function() {
				var i, key, rendered, renderedObserver, fragment, container = _getContainer.call(this);
				// Cleanup from last render, elements, subviews, and observers
				for(i = 0; i < this._rendered.length; ++i) {
					rendered = this._rendered[i];
					if(!(rendered instanceof Backbone.View))
						container.removeChild(rendered);
				}
				this._rendered = null;
				for(i = 0; i < this._renderedSubviews.length; ++i)
					this._renderedSubviews[i].remove();
				this._renderedSubviews = [];
				for(key in this._renderedObservers) {
					if(this._renderedObservers.hasOwnProperty(key))
						this.unobserve(key, this._renderedObservers[key]);
				}
				this._renderedObservers = {};
				// Check to see if arguments have been updated and save them to be used when calling the __render method
				// The initial setTimeout and observer method both use setTimeout with no arguments, so the arguments should be empty through those calls
				if(arguments.length)
					this._renderedArgs = Array.prototype.slice.call(arguments);
				// Render and replace the observe method while rendering, so that observers bound to elements etc aren't saved
				// Instead just a single immediate callback and the actual observer is a debounced render
				renderedObserver = _once(this.render.bind(this));
				this.observe = function(key, observer) {
					Backbone.Cord.View.prototype.observe.call(this, Backbone.Cord.config.oncePrefix + key, observer);
					if(!this._renderedObservers[key])
						Backbone.Cord.View.prototype.observe.call(this, key, this._renderedObservers[key] = renderedObserver);
				};
				this._rendered = __render.apply(this, this._renderedArgs) || [];
				if(!(this._rendered instanceof Array))
					this._rendered = [this._rendered];
				delete this.observe;
				// Add the new rendered nodes to the container
				fragment = document.createDocumentFragment();
				for(i = 0; i < this._rendered.length; ++i) {
					rendered = this._rendered[i];
					if(rendered instanceof Backbone.View)
						fragment.appendChild(rendered.el);
					else
						fragment.appendChild(rendered);
				}
				container.appendChild(fragment);
				return this;
			};
			this._rendered = [];
			this._renderedArgs = [];
			this._renderedSubviews = [];
			this._renderedObservers = {};
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

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

;(function(Backbone) {
'use strict';

var THIS_ID = '(this)';

Backbone.Cord.mediaQueries = {
	all: '',
	hd: 'only screen and (max-width: 1200px)',
	desktop: 'only screen and (max-width: 992px)',
	tablet: 'only screen and (max-width: 768px)',
	phablet: 'only screen and (max-width: 480px)',
	mobile: 'only screen and (max-width: 320px)'
};

function _createStyleSheets() {
	var el, key;
	Backbone.Cord._styleSheets = {};
	for(key in Backbone.Cord.mediaQueries) {
		if(Backbone.Cord.mediaQueries.hasOwnProperty(key)) {
			// Note: cannot use id on stlye tags, but could add a data attribute for identifying
			// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/style
			// https://davidwalsh.name/add-rules-stylesheets
			el = document.createElement('style');
			el.type = 'text/css';
			if(Backbone.Cord.mediaQueries[key])
				el.media = Backbone.Cord.mediaQueries[key];
			// Webkit hack
			el.appendChild(document.createTextNode(''));
			document.head.appendChild(el);
			Backbone.Cord._styleSheets[key] = el.sheet;
		}
	}
}

function _camelCaseToDash(str) {
	var i, c, start = 0;
	var words = [];
	for(i = 0; i < str.length; ++i) {
		c = str.charCodeAt(i);
		if(c >= 65 && c <= 90 && i) {
			words.push(str.substring(start, i).toLowerCase());
			start = i;
		}
	}
	words.push(str.substring(start, i).toLowerCase());
	return words.join('-');
}

function _addRules(rules, _styles, selector, media, id) {
	var key, sheet, mediaQuery, idQuery;
	media = media || 'all';
	sheet = Backbone.Cord._styleSheets[media];
	for(key in rules) {
		if(rules.hasOwnProperty(key)) {
			if(typeof rules[key] === 'object') {
				mediaQuery = idQuery = null;
				if(key.indexOf(Backbone.Cord.config.mediaPrefix) === 0) {
					mediaQuery = key.substr(Backbone.Cord.config.mediaPrefix.length);
					if(!Backbone.Cord.mediaQueries[mediaQuery])
						return;
				}
				if(!mediaQuery && Backbone.Cord.mediaQueries[key])
					mediaQuery = key;
				if(!mediaQuery) {
					if(key[0] === '_' || key[0] === '#')
						idQuery = key.substr(1);
					if(idQuery && !Backbone.Cord.regex.testIdProperty(idQuery, true))
						idQuery = null;
				}
				if(mediaQuery)
					_addRules(rules[key], _styles, selector, mediaQuery);
				else if(idQuery)
					_addRules(rules[key], _styles, selector + '>' + Backbone.Cord.regex.replaceIdSelectors('#' + idQuery), media, idQuery);
				else
					_addRules(rules[key], _styles, selector + '>' + Backbone.Cord.regex.replaceIdSelectors(key), media);
			}
			else {
				if(Backbone.Cord.regex.variableSearch.test(rules[key])) {
					var scope = id || THIS_ID;
					if(!_styles[scope])
						_styles[scope] = {};
					_styles[scope][key] = rules[key];
				}
				else {
					console.log('@' + media + ' ' + selector + '{' + _camelCaseToDash(key) + ':' + rules[key] + ';}');
					sheet.insertRule(selector + '{' + _camelCaseToDash(key) + ':' + rules[key] + ';}', 0);
				}
			}
		}
	}
}

var __extend = Backbone.Cord.View.extend;
Backbone.Cord.View.extend = function(properties) {
	// Look for styles hash
	var _styles = {};
	if(properties.styles && properties.className) {
		if(!Backbone.Cord._styleSheets)
			_createStyleSheets();
		_addRules(properties.styles, _styles, '.' + properties.className.split(' ').join('.'));
	}
	var View = __extend.apply(this, Array.prototype.slice.call(arguments));
	View.prototype._styles = _styles;
	return View;
};

function _createStyleObserver(node, style) {
	return function(key, formatted) {
		node.style[style] = Backbone.Cord.convertToString(formatted);
	};
}

function _styles(context, attrs) {
	var styles = attrs.style;
	if(styles) {
		if(typeof styles === 'string' && context.isView && this[styles]) {
			styles = this[styles];
		}
		if(typeof styles === 'object') {
			// The math plugin doesn't do a deep process of the attributes so invoke string processing here
			this._plugin('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style)) {
					if(styles[style].match(Backbone.Cord.regex.variableSearch) && context.isView)
						this.observeFormat(styles[style], _createStyleObserver(context.el, style), true);
					else
						context.el.style[style] = styles[style];
				}
			}
			delete attrs.style;
		}
	}
}

// Accept a style that is either an object or a key to a style object on this (non-binding!)
// e.g. {style: 'mystyle'}, where this.mystyle is an object
// To create an inline style bound to a property, use the binding plugin
// Otherwise, a normal inline-styles string will fall-through and get applied outside this plugin
// e.g. background-color: green; cursor: help;
// When interpolating variables into styles, use this over an interpolated attribute string value
// because the interpolated string value will overwrite any changes to styles on the node made through javascript e.g. the hidden plugin
// Note: interpolated styles are not supported under media queries and require idProperties to be true
Backbone.Cord.plugins.push({
	name: 'styles',
	requirements: ['interpolation'],
	config: {
		mediaPrefix: '@'
	},
	attrs: _styles,
	bindings: _styles,
	initialize: function(context) {
		if(this._styles && this._styles[THIS_ID]) {
			var styles = JSON.parse(JSON.stringify(this._styles[THIS_ID]));
			console.log(JSON.stringify(styles));
			this._plugin('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style))
					this.observeFormat(styles[style], _createStyleObserver(this.el, style), true);
			}
		}
	},
	complete: function(context) {
		// Apply any dynamic class styles detected from the initial extend
		if(this._styles && context.id && this._styles[context.id]) {
			var styles = JSON.parse(JSON.stringify(this._styles[context.id]));
			console.log(JSON.stringify(styles));
			this._plugin('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style))
					this.observeFormat(styles[style], _createStyleObserver(context.el, style), true);
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

// Notes on events:
// request (when fetch starts)
// sync (when sync has finished successfully, fetch, save, and destroy)
// error (when a sync error occurs)
function _addListeners(modelCollection) {
	this.listenTo(modelCollection, 'request', function() {
		this.syncing = true;
	});
	this.listenTo(modelCollection, 'sync', function() {
		this.syncing = false;
		this.error = null;
	});
	this.listenTo(modelCollection, 'error', function(collection, response, options) {
		this.syncing = false;
		this.error = Backbone.Cord.parseError(response, options);
	});
}

// Wrap the sync method to detect when a request is taking place, only done in case a sync starts before being given to a View
// Apply listeners only once
var __modelSync = Backbone.Model.prototype.sync;
Backbone.Model.prototype.sync = function() {
	if(!this.__syncListening) {
		this.__syncListening = true;
		_addListeners.call(this, this);
	}
	return __modelSync.apply(this, Array.prototype.slice.call(arguments));
};
var __collectionSync = Backbone.Collection.prototype.sync;
Backbone.Collection.prototype.sync = function() {
	if(!this.__syncListening) {
		this.__syncListening = true;
		_addListeners.call(this, this);
	}
	return __collectionSync.apply(this, Array.prototype.slice.call(arguments));
};

// Do the listeners for the View to collection or model
function _setup() {
	var key = 'syncing';
	if(this.collection) {
		this[key] = !!this.collection[key];
		_addListeners.call(this, this.collection);
	}
	else if(this.model) {
		this[key] = !!this.model[key];
		_addListeners.call(this, this.model);
	}
}

// Wrap both setModel and setCollection to addListeners and grab the current value of syncing
var __setModel = Backbone.Cord.View.prototype.setModel;
Backbone.Cord.View.prototype.setModel = function(newModel, noCascade) {
	var ret = __setModel.call(this, newModel, noCascade);
	_setup.call(this);
	return ret;
};
var __setCollection = Backbone.Cord.View.prototype.setCollection;
Backbone.Cord.View.prototype.setCollection = function(newCollection) {
	var ret = __setCollection.call(this, newCollection);
	_setup.call(this);
	return ret;
};

// Default parseError method, Simply read the http status
Backbone.Cord.parseError = function(response) {
	return response.status;
};

// Adds a "syncing" boolean property to the View to track when its collection or model is syncing
Backbone.Cord.plugins.push({
	name: 'syncing',
	create: function() {
		this._synthesizeProperty('syncing');
		this._synthesizeProperty('error');
		_setup.call(this);
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var SCOPE_NAME = 'sharedscope';

function _modelObserver(model) {
	var key, changed = model.changedAttributes();
	if(!changed)
		return;
	for(key in changed) {
		if(changed.hasOwnProperty(key))
			this._invokeObservers(key, changed[key], SCOPE_NAME);
	}
}

Backbone.Cord.shared = new Backbone.Model();

// Scope for a single globally shared Backbone model
// Listeners on the model are automatically added and removed
// Final cleanup is automatic on remove() when backbone calls stopListening()
Backbone.Cord.plugins.push({
	name: SCOPE_NAME,
	config: {
		sharedPrefix: '$'
	},
	scope: {
		getKey: function(key) {
			if(key.indexOf(Backbone.Cord.config.sharedPrefix) === 0)
				return key.substr(Backbone.Cord.config.sharedPrefix.length);
		},
		observe: function() {
			if(!Object.keys(this._getObservers(null, SCOPE_NAME)).length)
				this.listenTo(Backbone.Cord.shared, 'change', _modelObserver);
		},
		unobserve: function() {
			if(!Object.keys(this._getObservers(null, SCOPE_NAME)).length)
				this.stopListening(Backbone.Cord.shared, 'change', _modelObserver);
		},
		getValue: function(key) {
			return Backbone.Cord.shared.get(key);
		},
		setValue: function(key, value) {
			Backbone.Cord.shared.set(key, value);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var SCOPE_NAME = 'viewscope';

function _propertyObserver(key, prevSet) {
	var newSet = function(value) {
		if(prevSet)
			prevSet.call(this, value);
		else
			this._setProperty(key, value);
		this._invokeObservers(key, this[key], SCOPE_NAME);
	};
	newSet._cordWrapped = true;
	newSet._prevSet = prevSet;
	return newSet;
}

// Observe to add observer methods for existing view properties first and model attributes second
// Partly based on the watch/unwatch polyfill here: https://gist.github.com/eligrey/384583
// If wrapping properties, be sure to set configurable: true and (recommended) enumerable: true
Backbone.Cord.plugins.push({
	name: SCOPE_NAME,
	config: {
		viewPrefix: '_'
	},
	scope: {
		getKey: function(key) {
			if(key.indexOf(Backbone.Cord.config.viewPrefix) === 0)
				return key.substr(Backbone.Cord.config.viewPrefix.length);
		},
		observe: function(key) {
			var prop = Object.getOwnPropertyDescriptor(this, key);
			if(!prop)
				return;
			if(!prop.set._cordWrapped) {
				if(prop.set) {
					// Just wrap the setter of a defined property
					Object.defineProperty(this, key, {set: _propertyObserver(key, prop.set)});
				}
				else {
					// Define a new property without an existing defined setter
					this._setProperty(key, this[key]);
					if(delete this[key]) {
						Object.defineProperty(this, key, {
							get: this._synthesizeGetter(key),
							set: _propertyObserver(key),
							enumerable: true,
							configurable: true
						});
					}
				}
			}
		},
		unobserve: function(key) {
			if(!this._getObservers(key, SCOPE_NAME).length) {
				var prop = Object.getOwnPropertyDescriptor(this, key);
				if(prop.set._prevSet) {
					// Unwrap the previous set method
					Object.defineProperty(this, key, {set: prop.set._prevSet});
				}
				else {
					// Convert the property back to a normal attribute
					var value = this[key];
					delete this[key];
					this[key] = value;
				}
			}
		},
		getValue: function(key) {
			return this[key];
		},
		setValue: function(key, value) {
			this[key] = value;
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
