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
