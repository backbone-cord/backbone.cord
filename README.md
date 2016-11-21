About
-------------------------------

**backbone.cord.js** enhances Backbone by enabling the easy creation of reactive connected views with two-way data binding and Jade-like declarative syntax.

#### Requirements

* Backbone 1.1+, other versions and variants may also work but haven't been tested
* Modern Browser, IE9+ - Array.indexOf, Object.getPrototypeOf, Object.defineProperty, Object.getOwnPropertyDescriptor, and Function.bind methods are used, possibly others that would need a polyfill on older browsers

*NOTE:* jQuery and Underscore.js are NOT required, though normally used with Backbone.

Additions to Backbone
-------------------------------

* assumes that each view only has model or collection set, and if a view has collection, then el will reactively render more than one? this moves part of the parent responsibility to the child?
* properties hash is added

#### el

Implement el as a function and it will be passed createElement and createSubview methods as arguments. Name these however you want.

```javascript
var MyView = Backbone.View.extend({
	el: function(h, s) {
		return h('', {},
			'Text node child',
			h('p', 'A paragraph child. I have {_x} pet {_animal}s.')
		);
	}
	properties: {
		animal: 'dog',
		x: 2
	}
});
```

#### properties

The properties dictionary will initialize property methods before el() is called and the layout created. By default properties are created with get/set methods that simple set an internal variable that is prefixed with an _. To override default methods implement them as _get<PropertyName>() and _set<PropertyName>(value). 

#### render

The render method will typically go unused, but it could be used for rendering variant views or applying some global state change by rendering some supplied arguments or data.


**NOTE:** Properties are set before the el method is called, so take caution when referencing dom elements from within the set methods.

**NOTE:** Memory leaks can occur when removing elements that make use of binding. Unbinding happens when the containing View is removed. Subviews replaced with other subviews does proper cleanup.

Methods
-------------------------------

`createElement(tagIdClasses[, attrs][, children])`

**NOTE:** To insert text that doesn't process bindings and other special synax, simply directly create a text node with document.createTextNode()

`createSubview(instanceClass[, idClasses][, events])`

Observing
-------------------------------

`observe(key, observer, immediate)` is added as method to Backbone.View, where a key and observer method can be given to register a callback for any changes. Typically this method is not called directly but indirectly through binding using the binding plugin.

The following key syntax is supported:

* !variable - wraps the callback in a function that will negate the value of variable into a boolean
* %variable - indicates that an immediate callback will happen and observing won't take place - useful as an optimization for variables that won't change - not compatible with !

Builtin to the core is support for observing attributes on the View's model. The keys are just given as keys accessible into the model.  Other scopes are supported through the plugin system.

Using the key 'id' will result in using the model's idAttribute as a key instead.


Builtin Plugins
-------------------------------

Most of cord's functionality is implemented using plugins.  Plugins do not implement any kind of dependency management and rely on proper load order or concatenation order in build scripts. Although there is a one-time requirements check when the first View is initialized.

* **binding** - bindings within attributes and text nodes
* **collection** - managing a view with a collection
* **conditionalclasses** - Apply or remove a css class based on the boolean value of a variable
* **dataid** - Changes all of the id attributes into data-id attributes, so they may be reused among different instance of the same View
* **dynamicclasses** - Bind part or all of an elements css classname based on the value of a variable
* **events** - Specify onX events in the attributes dictionary of an element
* **hidden** - A special attribute hidden which will alter the display of the element depending on the boolean value of the variable
* **interpolation** - Adds the method observeFormat to Backbone.View, where a formatted string of variables is observer instead of a single
* **math** - Create mathematical expressions that can be bound
* **reversebinding** - Set values based on input or change events from an input element
* **styles** - Dynamically creates stylesheets or observes variables based on a dictionary of styles
* **syncing** - Adds two properties, 'syncing' and 'error' to the View to indicate when a model or collection is syncing
* **scopes** - Variable scopes
	* **shared** - Adds a shared model that can be used to globally share variables
	* **view** - Scope, where properties on the view become variables that can be observed


Plugin Examples
-------------------------------

#### binding

Binds element attributes and text-based children to variables.

```javascript
createElement('div', {data-name: '{name}'}, 'Example with name bound here: {name}.');
```

*NOTE:* Any DOM attribute can be bound to a variable or a formatted string, however it is recommended to NOT use the style attribute in this way because any styles applied with javascript, like with the hidden plugin will get lost when the style attribute is set on a value getting updated.

#### binding (reverse)

Reverse binding can be done with special `input` or `change` attributes, each corresponding to those triggered events.

```javascript
createElement('input', {change:'varName'});
```

#### hidden

```javascript
createElement('input', {hidden:'!varName'});
```

#### events

The events plugin allows for easier mapping of all DOM events to a View function. The attributes simply need to be specified as onX, where is X is any event name that can be passed to addEventListener().  Backbone's events hash may also be used not all event listeners need to be created this way.

```javascript
createElement('button', {onclick: 'viewMethod'});
createSubview(Subview, {onclick: 'parentViewMethod'});
```

#### conditionalclasses

A CSS can be conditionally applied using the following syntax.

```javascript
createElement('button.myclass(varName)');
```

#### dynamicclasses

A CSS class may be changed dyanmically using the value of a variable. For example, the following may set the class of button to any value of varName with the myclass- prefix, e.g. myclass-red, myclass-blue

```javascript
createElement('button.myclass-{varName}');
```

#### styles

The styles plugin can apply styling to a whole view (non-subview) DOM heirarchy in a View and it can also apply styling to a single element.

Single element styling is done using the special style attribute and is applied directly to the elements style javascript object. The example below creates a green button 100px wide. 

```javascript
createElement('button', {style: {color: 'white', width: '100px', backgroundColor: 'green'}});
```

Styling the entire layout can be accomplished with a style object on the view.

NOTE: A className must be provided on the view in order to create dynamic stylesheets

```javascript
Backbone.View.extend({
	className: '',
	styles: {
		backgroundColor: '#DDD',
		border: '2px dotted #CCC',
		boxShadow: '1px 2px 2px black',
		'#container': {
			borderLeft: '10px solid black'
		}
	}
});
```

The following top-level dictionaries can be used to create media queries:

* mobile
* phablet
* tablet
* desktop
* hd

#### math

The math plugin creates a special binding syntax :=expression=:, that can bind to all the variables provided in the expression and update through a single expression property on the View.

```javascript
createElement('', 'The variable x is :=100 - {x}=: less than one hundred.');
```

#### syncing

The syncing plugin adds a `syncing` and `error` attributes to all Views, Models, and Collections.  The View's attributes are based on events from it's model or collection and are observable.

The error attribute is set through a callback function defined under `Backbone.Cord.parseError(xhrResponse)`. Override this to parse errors from expected responses.

Creating Plugins
-------------------------------

#### Specification

Plugins define a name, requirements, any number of callbacks, and then register themselves either by pushing or unshifting one plugin at a time to the plugins array.

Dependencies can be specified as the key `requirements`, an array of strings, inside the plugin and Cord will automatically check to make sure plugins wih those names are also registered.  It does not however check the order of plugins.  To ensure a plugin is run before others use the unshift method.

#### Scope Specification

Plugins can also provide a variable binding scope for to allow access to other variables outside of the View's model. All that is needed is a `scope` object specified in the plugin with the following methods:

* `getKey(key)` - given a raw key, return the internal actual key this scope uses internally. For example, the viewscope looks for a prefix of _ and returns the key without that prefix that will be used as the first argument to every other scope method
* `observe(key, observer, immediate)` - a callback before the observer is added to the observer list
* `unobserve(key, observer)` - a callback after the observer is removed from the observer list
* `getValue(key)` - return the value given a key
* `setValue(key, value)` - set a value given a key

Reference of What Gets Added
-------------------------------

#### View

#### Model and Collection

When using the syncing plugin, the prototype.sync method gets wrapped and the following properties are added to the object:

Security
-------------------------------

The math plugin can evaluate arbitrary expressions. Be careful to not pass any insecure user-supplied strings directly in as children or atributes on the el method.

License
-------------------------------
MIT
