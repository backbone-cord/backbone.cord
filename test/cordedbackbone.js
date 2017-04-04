if(!global.window) {
	var jsdom = require('jsdom');
	var window = jsdom.jsdom().defaultView;
	global.window = window;
	global.document = window.document;
	global.navigator = window.navigator;
	global.Node = window.Node;
	var Backbone = require('backbone');
	// jquery needs to be initialized outside of backbone for some strange reason
	// http://stackoverflow.com/questions/20380958/browserify-with-jquery-2-produces-jquery-requires-a-window-with-a-document
	window.$ = Backbone.$ = require('jquery');
	var Cord = require('../backbone.cord');
	// require all of the plugins to activate them
	require('../plugins/binding');
	require('../plugins/classes');
	require('../plugins/collection');
	require('../plugins/computed');
	require('../plugins/events');
	require('../plugins/hidden');
	require('../plugins/interpolation');
	require('../plugins/math');
	require('../plugins/render');
	require('../plugins/styles');
	require('../plugins/sharedscope');
	require('../plugins/validation');
}
module.exports = require('backbone');
