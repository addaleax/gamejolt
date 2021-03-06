angular.module( 'App.Views' ).config( function( $stateProvider )
{
	$stateProvider.state( 'dashboard.developer.games.manage.packages.release', {
		abstract: true,
		url: '/{packageId:int}/releases/{releaseId:int}',
		controller: 'Dashboard.Developer.Games.Manage.Packages.ReleaseCtrl',
		controllerAs: 'releaseCtrl',
		templateUrl: '/app/views/dashboard/developer/games/manage/packages/release/release.html',
		resolve: {
			payload: function( $stateParams, Api )
			{
				return Api.sendRequest( '/web/dash/developer/games/builds/' + $stateParams.id + '/' + $stateParams.packageId + '/' + $stateParams.releaseId );
			}
		}
	} );
} );
