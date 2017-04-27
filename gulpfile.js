const gulp = require('gulp');
const concat = require('gulp-concat');

const scriptsBackbone = ['cord.js', 'backbone.cord.js', 'lib/**/*.js'];
const scriptsReact = ['cord.js', 'react.cord.js', 'lib/model.js', 'lib/router.js', 'lib/mixins/syncing.js', 'lib/mixins/validation.js'];
const files = {
	mainBackbone: 'backbone.cord.js',
	minBackbone: 'backbone.cord.min.js',
	mainReact: 'react.cord.js',
	minReact: 'react.cord.min.js'
};
const destDir = 'dist';

gulp.task('lint', () => {
	// Run linting on the all Javascript
	const jshint = require('gulp-jshint');
	return gulp.src(scriptsBackbone.concat(scriptsReact))
		.pipe(jshint())
		.pipe(jshint.reporter());
});

gulp.task('scripts-backbone', [], () => {
	// Combine all the plugins into a single script and also create a minified version
	const uglify = require('gulp-uglify');
	return gulp.src(scriptsBackbone)
		.pipe(concat(files.mainBackbone))
		.pipe(gulp.dest(destDir))
		.pipe(uglify())
		.pipe(concat(files.minBackbone))
		.pipe(gulp.dest(destDir));
});

gulp.task('scripts-react', [], () => {
	// Combine all the plugins into a single script and also create a minified version
	const uglify = require('gulp-uglify');
	return gulp.src(scriptsReact)
		.pipe(concat(files.mainReact))
		.pipe(gulp.dest(destDir))
		.pipe(uglify())
		.pipe(concat(files.minReact))
		.pipe(gulp.dest(destDir));
});

gulp.task('build', ['scripts-backbone', 'scripts-react']);

gulp.task('serve', ['build'], () => {
	const connect = require('gulp-connect');
	connect.server({root: ['dev', destDir, 'node_modules'], livereload: true});
	gulp.watch(scriptsBackbone, ['scripts-backbone']);
	gulp.watch(scriptsReact, ['scripts-react']);
	gulp.watch(destDir + '/**').on('change', (event) => { gulp.src(event.path).pipe(connect.reload()); });
});
gulp.task('default', ['serve']);
