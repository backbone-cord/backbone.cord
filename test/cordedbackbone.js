if(!global.window) {
	const jsdom = require('jsdom');
	const window = jsdom.jsdom().defaultView;
	global.window = window;
	global.document = window.document;
	global.navigator = window.navigator;
	global.Node = window.Node;
	const Backbone = require('backbone');
	// jquery needs to be initialized outside of backbone for some strange reason
	// http://stackoverflow.com/questions/20380958/browserify-with-jquery-2-produces-jquery-requires-a-window-with-a-document
	window.$ = Backbone.$ = require('jquery');
	const Cord = require('../backbone.cord');
	// require all of the plugins to activate them
	require('../lib/plugins/binding');
	require('../lib/plugins/classes');
	require('../lib/mixins/collection');
	require('../lib/plugins/computed');
	require('../lib/plugins/events');
	require('../lib/plugins/hidden');
	require('../lib/plugins/interpolation');
	require('../lib/plugins/render');
	require('../lib/plugins/styles');
	require('../lib/scopes/unmanaged');
	require('../lib/mixins/validation');
}
module.exports = require('backbone');
