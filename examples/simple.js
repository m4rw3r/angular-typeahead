"use strict";

var mod = angular.module("simple", ["ng", "mw-typeahead"]);

function fullName(p) {
  return p.firstName + " " + p.lastName;
}

SimpleCtr.$inject = ["$scope"];
function SimpleCtr($scope) {
  $scope.queryNames = function(prefix) {
    prefix = prefix.toLowerCase();

    return names.filter(function(p) {
      return fullName(p).toLowerCase().indexOf(prefix) === 0;
    }).slice(0, 10);
  };
}

mod.controller("SimpleCtrl", SimpleCtr);
