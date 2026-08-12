(function (FP) {
  FP.serverOfflineBannerHtml = function serverOfflineBannerHtml() {
    return '<span class="alert-chip danger">Sin conexion al servidor FEL POS. Revisa la PC servidor / red. Los cobros no funcionaran hasta reconectar.</span>';
  };

  FP.isServerReachableStatus = function isServerReachableStatus(status) {
    const code = Number(status || 0);
    return code >= 200 && code < 500;
  };
})(window.FelPos = window.FelPos || {});
