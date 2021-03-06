var argv = require( 'minimist' )( process.argv );
var gulp = require( 'gulp' );
var gutil = require( 'gulp-util' );
var plugins = require( 'gulp-load-plugins' )();
var sequence = require( 'run-sequence' );
var fs = require( 'fs' );
var os = require( 'os' );
var _ = require( 'lodash' );
var shell = require( 'gulp-shell' );
var path = require( 'path' );
var fs = require( 'fs' );

module.exports = function( config )
{
	var packageJson = require( path.resolve( __dirname, '../package.json' ) );
	config.client = argv.client || false;
	config.arch = argv.arch || '64';
	config.gypArch = config.arch == '64' ? 'x64' : 'ia32';

	// Get our platform that we are building on.
	switch ( os.type() ) {
		case 'Linux':
			config.platform = 'linux'; break;

		case 'Windows_NT':
			config.platform = 'win'; break;

		case 'Darwin':
			config.platform = 'osx'; break;

		default:
			throw new Error( 'Can not build client on your OS type.' );
	}

	// On Windows builds we have to use npm3. For other OSes it's faster to do npm2.
	// npm3 does a flat directory structure in node_modules, so the path is different.
	// We have to find where the lzma-native path is so we can compile it.
	var lzmaPath = path.join( 'node_modules', 'lzma-native' );
	try {
		// Will throw if no path exists.
		fs.statSync( path.resolve( lzmaPath ) );
	}
	catch ( e ) {
		lzmaPath = path.join( 'node_modules', 'client-voodoo', 'node_modules', 'lzma-native' );
	}

	gulp.task( 'client:gyp', shell.task( [
		'cd ' + path.resolve( lzmaPath ) + ' && nw-gyp clean configure build --target=0.12.3 --arch=' + config.gypArch,
	] ) );

	var releaseDir = path.join( 'build/client/prod', 'v' + packageJson.version );
	var s3Dir = 's3://gjolt-data/data/client/releases/v' + packageJson.version;

	gulp.task( 'client:push-release:linux', shell.task( [
		'aws s3 cp ' + releaseDir + '/linux64.tar.gz ' + s3Dir + '/game-jolt-client.tar.gz --acl public-read',
		'aws s3 cp ' + releaseDir + '/linux64-package.tar.gz ' + s3Dir + '/linux64-package.tar.gz --acl public-read',
	] ) );

	gulp.task( 'client:push-release:osx', shell.task( [
		'aws s3 cp ' + releaseDir + '/osx.dmg ' + s3Dir + '/GameJoltClient.dmg --acl public-read',
		'aws s3 cp ' + releaseDir + '/osx64-package.tar.gz ' + s3Dir + '/osx64-package.tar.gz --acl public-read',
	] ) );

	gulp.task( 'client:push-release:win', shell.task( [
		'aws s3 cp ' + releaseDir + '/Setup.exe ' + s3Dir + '/GameJoltClientSetup.exe --acl public-read',
		'aws s3 cp ' + releaseDir + '/win32-package.tar.gz ' + s3Dir + '/win32-package.tar.gz --acl public-read',
	] ) );

	// We can skip all this stuff if not doing a client build.
	if ( !config.client ) {
		return;
	}

	config.platformArch = config.platform + config.arch;
	config.includeNode = true;  // Include nodejs files.
	config.noInject = true;  // Don't revision filenames.
	config.noSourcemaps = true;  // Reduce package size. Not needed.

	config.clientBuildCacheDir = 'build/client/cache';

	if ( config.production ) {
		config.buildDir = 'build/client/prod/source';
		config.clientBuildDir = 'build/client/prod';
	}
	else {
		config.buildDir = 'build/client/dev/source';
		config.clientBuildDir = 'build/client/dev';
	}

	var appScripts = [
		'<script src="/app/modules/client.js"></script>',
	];

	var authScripts = [
		'<script src="/app/modules/client.js"></script>',
		'<script src="/app/modules/client-auth.js"></script>',
	];

	if ( config.production ) {
		appScripts.push( '<script src="/app/modules/client-updater.js"></script>' );
		authScripts.push( '<script src="/app/modules/client-updater.js"></script>' );
	}

	// Injections to modify App for client build.
	config.injections = {
		'/* inject client:modules */': "'App.Client',",
		'<!-- inject client:modules -->': appScripts.join( ' ' ),

		// For auth section we load the whole client JS but only load the angular modules we want
		// through the auth-client.js module.
		'/* inject client:auth:modules */': "'App.ClientAuth',",
		'<!-- inject client:auth:modules -->': authScripts.join( ' ' ),

		// Attach a class to say that we're in client.
		// Makes it easy to target client before angular has loaded in completely with CSS.
		'<body class="" ': '<body class="is-client" ',
	};

	/**
	 * Modify base tags for main HTML files.
	 * This is needed for non-html5 location fallback.
	 */
	var modifySections = config.sections.map( function( section )
	{
		if ( section == 'app' ) {
			section = 'index';
		}

		gulp.task( 'client:modify-index:' + section, function()
		{
			// Base tag for index.html is different.
			// App uses fallback mode for location since it's not served through a server.
			var base = '/' + section + '.html';

			// When packaged up, we put it in the sub-folder: "package".
			if ( !config.watching && os.type() != 'Darwin' ) {
				base = '/package' + base;
			}

			return gulp.src( config.buildDir + '/' + section + '.html' )
				.pipe( plugins.replace( '<base href="/">', '<base href="' + base + '">' ) )
				.pipe( gulp.dest( config.buildDir ) );
		} );

		return 'client:modify-index:' + section;
	} );

	// Set it up as a post-html build task.
	gulp.task( 'html:post', modifySections );

	gulp.task( 'client:prepare', function()
	{
		// Load in the client package.
		var packageJson = require( '../package.json' );
		var clientJson = require( '../client-package.json' );

		// Copy over values from main package.json to keep in sync.
		clientJson.version = packageJson.version;

		// Gotta pull the node_modules that we need.
		clientJson.dependencies = packageJson.dependencies;

		// If we're in dev, then add the toolbar for debugging.
		if ( !config.production ) {
			clientJson.window.toolbar = true;
		}

		if ( !config.watching && os.type() != 'Darwin' ) {

			// We set the base directory to use the "package" folder.
			clientJson.main = 'app://game-jolt-client/package/index.html#!/';
			clientJson.window.icon = 'package/' + clientJson.window.icon;
		}

		// Copy the package.json file over into the build directory.
		fs.writeFileSync( config.buildDir + '/package.json', JSON.stringify( clientJson ) );
	} );

	var nodeModuletasks = [
		'cd ' + config.buildDir + ' && npm install --production',
		'cd ' + path.resolve( config.buildDir, lzmaPath ) + ' && nw-gyp clean configure build --target=0.12.3 --arch=' + config.gypArch,
	];

	// http://developers.ironsrc.com/rename-import-dll/
	if ( config.platform == 'win' ) {
		nodeModuletasks.push( path.resolve( 'tasks/rid.exe' ) + ' ' + path.resolve( config.buildDir, lzmaPath, 'build/Release/lzma_native.node' ) + ' nw.exe GameJoltClient.exe' )
	}

	gulp.task( 'client:node-modules', shell.task( nodeModuletasks ) );

	/**
	 * This should rewrite all file references to have the correct packaged folder prefix.
	 */
	gulp.task( 'client:modify-urls', function()
	{
		if ( os.type() == 'Darwin' ) {
			return;
		}

		var revAll = new plugins.revAll( {
			prefix: 'app://game-jolt-client/package',
			dontGlobal: [
				/^\/node_modules\/.*$/,
				/^\/tmp\/.*$/,
			],
			dontRenameFile: [ /^.*$/ ],  // Don't rename anything.
			transformFilename: function( file, hash )
			{
				// Don't rename the file reference at all, either.
				return path.basename( file.path );
			},
			debug: true,
		} );

		// Ignore folders from the very beginning speeds up the injection a lot.
		return gulp.src( [
				config.buildDir + '/**',
				'!' + config.buildDir + '/node_modules/**',
				'!' + config.buildDir + '/tmp/**',
			] )
			.pipe( revAll.revision() )
			.pipe( gulp.dest( config.buildDir ) );
	} );

	/**
	 * Does the actual building into an NW executable.
	 */
	gulp.task( 'client:nw', function()
	{
		var clientJson = require( '../client-package.json' );
		var NwBuilder = require( 'nw-builder' );

		// We want the name to be:
		// 'game-jolt-client' on linux - because kebabs rock
		// 'GameJoltClient' on win - so it shows up well in process list and stuff
		// 'Game Jolt Client' on mac - so it shows up well in Applications folder.
		var appName = 'game-jolt-client';
		if ( config.platform == 'win' ) {
			appName = 'GameJoltClient';
		}
		else if ( config.platform == 'osx' ) {
			appName = 'Game Jolt Client';
		}

		var nw = new NwBuilder( {
			version: '0.12.3',
			files: config.buildDir + '/**/*',
			buildDir: config.clientBuildDir,
			cacheDir: config.clientBuildCacheDir,
			platforms: [ config.platformArch ],
			appName: appName,
			buildType: function()
			{
				return 'v' + this.appVersion;
			},
			appVersion: clientJson.version,
			macZip: false,  // Use a app.nw folder instead of ZIP file
			macIcns: 'src/app/img/client/mac.icns',
			winIco: 'src/app/img/client/winico.ico',

			// Tells it not to merge the app zip into the executable. Easier updating this way.
			mergeApp: false,
		} );

		nw.on( 'log', console.log );

		return nw.build();
	} );

	// We have to load paths only when we're actually running the gulp task.
	// Otherwise the client config gulp task won't have a chance to run.
	function getReleaseDir()
	{
		// Load in the client package.
		var packageJson = require( '../package.json' );
		return path.join( config.clientBuildDir, 'v' + packageJson.version );
	}

	/**
	 * When packaging up the client, we need to push all the app files into a "package" folder.
	 * We do this so we can update really easily.
	 * This unzips the package.nw folder that nw-builder creates and pushes it into a "package" folder.
	 */
	gulp.task( 'client:nw-unpackage', function( cb )
	{
		var releaseDir = getReleaseDir();
		var base = path.join( releaseDir, config.platformArch );
		var packagePath = path.join( releaseDir, config.platformArch + '-package.zip' )

		if ( config.platform != 'osx' ) {
			var Decompress = require( 'decompress' );

			fs.renameSync( path.join( base, 'package.nw' ), packagePath );

			new Decompress()
				.src( packagePath )
				.dest( path.join( base, 'package' ) )
				.use( Decompress.zip() )
				.run( function( err, files )
				{
					if ( err ) {
						throw err;
					}

					var stream = gulp.src( base + '/package/**/*' )
						.pipe( plugins.tar( config.platformArch + '-package.tar' ) )
						.pipe( plugins.gzip() )
						.pipe( gulp.dest( releaseDir ) );

					stream.on( 'error', cb );
					stream.on( 'end', function()
					{
						fs.renameSync( path.join( base, 'package', 'node_modules' ), path.join( base, 'node_modules' ) );
						fs.renameSync( path.join( base, 'package', 'package.json' ), path.join( base, 'package.json' ) );
						cb();
					} );
				} );
		}
		else {
			var stream = gulp.src( base + '/Game Jolt Client.app/Contents/Resources/app.nw/**/*' )
				.pipe( plugins.tar( config.platformArch + '-package.tar' ) )
				.pipe( plugins.gzip() )
				.pipe( gulp.dest( releaseDir ) );

			stream.on( 'end', cb );
			stream.on( 'error', cb );
		}
	} );

	/**
	 * Packages up the client builds into archive files so they can be distributed easier.
	 */
	if ( config.platform == 'osx' ) {
		gulp.task( 'client:package', function( cb )
		{
			var appdmg = require( 'appdmg' );
			var releaseDir = getReleaseDir();

			var dmg = appdmg( {
				target: releaseDir + '/osx.dmg',
				basepath: path.resolve( __dirname, '..' ),
				specification: {
					title: 'Game Jolt Client',
					icon: 'src/app/img/client/mac.icns',
					background: 'src/app/img/client/dmg-background.png',
					'icon-size': 80,
					contents: [
						{ x: 195, y: 370, type: 'file', path: releaseDir + '/' + config.platformArch + '/Game Jolt Client.app' },
						{ x: 429, y: 370, type: 'link', path: '/Applications' }
					],
				}
			} );

			dmg.on( 'progress', function( info ){ console.log( info ); } );
			dmg.on( 'finish', function(){ console.log( 'Finished building DMG.' ); cb(); } );
			dmg.on( 'error', function( err ){ console.error( err );  cb( err ); } );
		} );
	}
	else if ( config.platform == 'win' ) {
		gulp.task( 'client:package', function( cb )
		{
			var Builder = require( 'nwjs-installer-builder' ).Builder;
			var releaseDir = getReleaseDir();
			var packageJson = require( path.resolve( __dirname, '..', 'package.json' ) );

			var builder = new Builder( {
				appDirectory: path.resolve( releaseDir, config.platformArch ),
				outputDirectory: releaseDir,
				name: 'GameJoltClient',
				version: packageJson.version,
				title: 'Game Jolt Client',
				description: 'The Game Jolt Client for Windows.',
				authors: 'Lucent Web Creative, LLC',
				loadingGif: config.buildDir + '/app/img/client/winstalling.gif',
				iconUrl: 'http://s.gjcdn.net/app/img/client/winico.ico',
				setupIcon: config.buildDir + '/app/img/client/winico.ico',
				certFile: path.resolve( __dirname, 'certs/win.p12' ),
				certPassFile: path.resolve( __dirname, 'certs/win-pass' ),
				files: {
					'GameJoltClient.exe': '',
					'locales\\**': 'locales',
					'node_modules\\**': 'node_modules',
					'package\\**': 'package',
					'package.json': '',
					'*.dll': '',
					'*.pak': '',
					'icudtl.dat': '',
				}
			} );

			return builder.build();
		} );
	}
	else {
		gulp.task( 'client:package', function()
		{
			var releaseDir = getReleaseDir();

			if ( config.production ) {
				return gulp.src( releaseDir + '/' + config.platformArch + '/**/*' )
					.pipe( plugins.tar( config.platformArch + '.tar' ) )
					.pipe( plugins.gzip() )
					.pipe( gulp.dest( releaseDir ) );
			}
		} );
	}

	if ( config.client ) {
		gulp.task( 'post', function( cb )
		{
			if ( config.watching ) {
				return sequence( 'client:prepare', cb );
			}

			return sequence( 'client:prepare', 'client:node-modules', 'client:modify-urls', 'client:nw', 'client:nw-unpackage', 'client:package', cb );
		} );
	}
};
