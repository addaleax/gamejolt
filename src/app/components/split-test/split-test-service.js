angular.module( 'App.SplitTest' ).service( 'SplitTest', function( $location, $window )
{
	var EXPERIMENT_GAME_MEDIA_BAR_POS = '5LcILHXgQxqyW60AGmoscw';

	this.getMediaBarPos = function( payload )
	{
		var variation = getVariation( payload, EXPERIMENT_GAME_MEDIA_BAR_POS );
		if ( variation === 1 ) {
			return 'no-banner';
		}
		else if ( variation == 2 ) {
			return 'above';
		}
		else if ( variation == 3 ) {
			return 'above-no-banner';
		}

		return 'original';
	};

	function getVariation( payload, experiment )
	{
		// Allows you to put the experiment in the URL to force it.
		// Example: /games/best?oCnfrO9TSku9N0t3viKvKg=1
		var queryParams = $location.search();
		if ( queryParams[ experiment ] ) {
			return parseInt( queryParams[ experiment ], 10 );
		}

		// Allow you to force an experiment variation permanently through localStorage.
		if ( $window.localStorage[ experiment ] ) {
			return parseInt( $window.localStorage[ experiment ], 10 );
		}

		if ( angular.isDefined( payload._experiment ) && angular.isDefined( payload._variation ) ) {
			if ( payload._experiment == experiment ) {
				return payload._variation;
			}
		}

		return -1;
	}
} );
