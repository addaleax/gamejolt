angular.module( 'App.Views' ).config( function( $stateProvider )
{
	$stateProvider.state( 'dashboard.account.linked-accounts.link-callback', {
		url: '/link-callback/:provider?oauth_verifier&code&state',
		controller: 'Dashboard.Account.LinkedAccounts.LinkCallbackCtrl',
		controllerAs: 'linkCallbackCtrl',
		resolve: {
			payload: function( Api, $stateParams )
			{
				// Force POST.
				if ( $stateParams.provider == 'twitter' ) {
					return Api.sendRequest( '/web/dash/linked-accounts/link-callback/' + $stateParams.provider
						+ '?oauth_verifier=' + $stateParams.oauth_verifier, {} );
				}
				else if ( $stateParams.provider == 'facebook' ) {
					return Api.sendRequest( '/web/dash/linked-accounts/link-callback/' + $stateParams.provider
						+ '?code=' + $stateParams.code + '&state=' + $stateParams.state, {} );
				}
			}
		}
	} );
} );
