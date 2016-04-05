;(function(Backbone) {
'use strict';

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
		if(!(typeof attrs === 'string' || attrs.nodeType === 1)) {
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
		var children = Array.prototype.slice.call(arguments, i);
		children = this._plugin('children', context, children) || children;
		for(i = 0; i < children.length; ++i) {
			if(typeof children[i] === 'string')
				el.appendChild(document.createTextNode(children[i]));
			else
				el.appendChild(children[i]);
		}
	}
	if(Backbone.Cord.config.idProperties && context.isView && id && Backbone.Cord.regex.testIdProperty(id)) {
		Object.defineProperty(this, id, {
			get: function() { return this.getChildById(id); },
			enumerable: true,
			configurable: false
		});
	}
	this._plugin('complete', context);
	return el;
}

// id and classes on the subview are maintained, but recommended that id is set by the parent view
function _subview(instanceClass, idClasses, bindings) {
	var id, classes, subview, context;
	if(!(instanceClass instanceof Backbone.View))
		subview = new instanceClass();
	else
		subview = instanceClass;
	// Init the subview's model - blocking the _invokeObservers method to prevent unnecessary observer invocations
	if(this.model !== Backbone.View.prototype.model && subview.model === Backbone.View.prototype.model) {
		subview._invokeObservers = function() {};
		if(!subview.cascade || subview.cascade(this.model) !== false)
			subview.setModel(this.model);
		delete subview._invokeObservers;
	}
	// Create the plugin context - isView should always be true, this method should never be called any other way
	context = { el: subview.el, isView: this instanceof Backbone.View };
	if(!context.isView)
		throw new Error('Attempting to create a subview without a parent.');
	if(typeof idClasses === 'string') {
		idClasses = idClasses.split('.');
		id = context.id = idClasses[0].substr(1);
		if(id && !subview.el.id)
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
				this.listenTo(subview, e, this[bindings[e]]);
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
				if(id && !el.id)
					Backbone.Cord.setId(el, id);
			},
			enumerable: true,
			configurable: false
		});
	}
	this._plugin('complete', context);
	return subview.el;
}

Backbone.Cord = {
	VERSION: '1.0.0',
	el: _el,
	config: {
		idProperties: true,
		oncePrefix: '%',
		notPrefix: '!'
	},
	regex: {
		idPropertyTest: /^[a-zA-Z_$][0-9a-zA-Z_$]*$/,
		idSelectorValues: /#([a-zA-Z_$][0-9a-zA-Z_$]*)/g
	},
	// Plugins install themselves by pushing to this array
	plugins: [],
	// EmptyView to use as a subview placeholder
	EmptyView: Backbone.View.extend({ el: function() { return document.createElement('meta'); }}),
	convertToString: function(obj) { if(obj === null || obj === undefined) return ''; return obj.toString(); },
	convertToBool: function(value) { return (value && (value.length === void(0) || value.length)); },
	// Unique internal subview id, this unifies how subviews with and without ids are stored
	_sid: 1,
	_pluginsChecked: false,
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
		// (el and subview) when creation and setup is complete, right before el and subview return
		complete: [],
		// (new View) initialize and remove apply to all views outside of the subview() method
		initialize: [],
		remove: [],
		// plugin callback to be used adhoc for processing strings from other plugins
		strings: []
	}
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
Backbone.View.prototype._el = _el;
Backbone.View.prototype._subview = _subview;
Backbone.View.prototype._plugin = _plugin;
Backbone.View.prototype._getWrappedProperty = function(key) {
	return this['_' + key];
};
Backbone.View.prototype._setWrappedProperty = function(key, value) {
	this['_' + key] = value;
};
Backbone.View.prototype._wrappedPropertyDescriptor = function(key) {
	var getFunc = this['_get' + key[0].toUpperCase() + key.substr(1)];
	var setFunc = this['_set' + key[0].toUpperCase() + key.substr(1)];
	if(!getFunc)
		getFunc = function() { return this._getWrappedProperty(key); };
	if(!setFunc)
		setFunc = function(value) { this._setWrappedProperty(key, value); };
	return {
		get: getFunc,
		set: setFunc,
		configurable: true,
		enumerable: true
	};
};
Backbone.View.prototype._modelObserver = function(model, options) {
	var key, changed = options._changed || model.changedAttributes();
	if(!changed)
		return;
	for(key in changed) {
		if(changed.hasOwnProperty(key))
			this._invokeObservers(key, changed[key]);
	}
};

// Do not modify the array or dictionary returned from this method, they may sometimes simply be an empty return value
Backbone.View.prototype._getObservers = function(newKey, scope) {
	var observers;
	if(scope)
		observers = this._observers[scope] || {};
	else
		observers = this._modelObservers;
	if(newKey)
		observers = observers[newKey] || [];
	return observers;
};
Backbone.View.prototype._invokeObservers = function(newKey, value, scope) {
	console.log(newKey, value, scope);
	var i, observers = this._getObservers(newKey, scope);
	for(i = 0; i < observers.length; ++i)
		observers[i].call(this, newKey, value);
	return this;
};

Backbone.View.prototype.observe = function(key, observer, immediate) {
	var name, immediateCallback, newKey, found, scope, scopes, observers;
	if(typeof observer === 'string')
		observer = this[observer];
	if(!observer)
		return this;
	scopes = Backbone.Cord._scopes;
	// If key starts with oncePrefix, just do an immediate timeout with the getValue
	// not compatible with the notPrefix and doesn't include the key on callback
	if(key.indexOf(Backbone.Cord.config.oncePrefix) === 0) {
		key = key.substr(Backbone.Cord.config.oncePrefix.length);
		setTimeout(function() { observer.call(this, null, this.getValue.call(this, key)); }.bind(this), 0);
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
		setTimeout(immediateCallback.bind(this, key, name), 0);
	return this;
};
Backbone.View.prototype.unobserve = function(key, observer) {
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
	// If no observers entry set, do model binding
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
Backbone.View.prototype.getValue = function(key) {
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
Backbone.View.prototype.setValue = function(key, value) {
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

Backbone.View.prototype.getChildById = function(id) {
	return document.getElementById(id);
};
Backbone.View.prototype.getSubviewById = function(id) {
	var node = this.getChildById(id);
	if(node)
		return this.subviews[node.getAttribute('data-sid')];
	return null;
};

// setModel will change the model a View has and invoke any observers
// For best performance and results, models should normally be provided in the View's constructor - only use setModel to swap out an existing model
// A default empty model is provided so that Cord and plugins can always count on a model being available, making the logic a bit easier
// setModel is defined as a method and not a property because it would be too confusing to distinguish between the first set and later changes, this is more explicit
Backbone.View.prototype.model = new (Backbone.Model.extend({set: function() { return this; }}))();
Backbone.View.prototype.setModel = function(newModel, noCascade) {
	var key, current, subview;
	if(this.model === newModel)
		return this;
	if(!newModel)
		newModel = Backbone.View.prototype.model;
	if(!(newModel instanceof Backbone.Model))
		throw new Error('Attempting to assign a non-Backbone.Model to View.model.');
	current = this.model;
	this.model = newModel;
	this.stopListening(current);
	this.listenTo(this.model, 'change', this._modelObserver);
	// Detect the changes and invoke observers
	if(Object.keys(this._modelObservers).length) {
		// Invoke all observers if the model is the empty model
		if(this.model === Backbone.View.prototype.model) {
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
Backbone.View.prototype.setCollection = function(newCollection) {
	this.stopListening(this.collection);
	this.collection = newCollection;
	return this;
};

// Wrap _ensureElement to add a subviews array
var __ensureElement = Backbone.View.prototype._ensureElement;
Backbone.View.prototype._ensureElement = function() {
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
	// Run plugin initializers and define the properties
	this._plugin('initialize', {});
	if(this.properties) {
		for(var key in this.properties) {
			if(this.properties.hasOwnProperty(key)) {
				Object.defineProperty(this, key, this._wrappedPropertyDescriptor(key));
				this[key] = this.properties[key];
			}
		}
	}
	// Bind the el method with prefixed args
	if(typeof this.el === 'function')
		this.el = this.el.bind(this, this._el.bind(this), this._subview.bind(this));
	this.subviews = {};
	this._observers = {};
	this._modelObservers = {};
	this._sharedObservers = {};
	// Start listening to the model
	if(this.model !== Backbone.View.prototype.model)
		this.listenTo(this.model, 'change', this._modelObserver);
	// After creating the element add any given className
	var ret = __ensureElement.apply(this, Array.prototype.slice.call(arguments));
	if(this.className)
		this.el.className += (this.el.className.length ? ' ' : '') + this.className;
	return ret;
};

// Wrap the remove method to also process subviews and plugins
var __remove = Backbone.View.prototype.remove;
Backbone.View.prototype.remove = function() {
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
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone);
