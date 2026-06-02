"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/api/reports/payroll/summary/route";
exports.ids = ["app/api/reports/payroll/summary/route"];
exports.modules = {

/***/ "@prisma/client":
/*!*********************************!*\
  !*** external "@prisma/client" ***!
  \*********************************/
/***/ ((module) => {

module.exports = require("@prisma/client");

/***/ }),

/***/ "../../client/components/action-async-storage.external":
/*!*******************************************************************************!*\
  !*** external "next/dist/client/components/action-async-storage.external.js" ***!
  \*******************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/action-async-storage.external.js");

/***/ }),

/***/ "../../client/components/request-async-storage.external":
/*!********************************************************************************!*\
  !*** external "next/dist/client/components/request-async-storage.external.js" ***!
  \********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/request-async-storage.external.js");

/***/ }),

/***/ "../../client/components/static-generation-async-storage.external":
/*!******************************************************************************************!*\
  !*** external "next/dist/client/components/static-generation-async-storage.external.js" ***!
  \******************************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/static-generation-async-storage.external.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "assert":
/*!*************************!*\
  !*** external "assert" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("assert");

/***/ }),

/***/ "buffer":
/*!*************************!*\
  !*** external "buffer" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("buffer");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("crypto");

/***/ }),

/***/ "events":
/*!*************************!*\
  !*** external "events" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("events");

/***/ }),

/***/ "http":
/*!***********************!*\
  !*** external "http" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("http");

/***/ }),

/***/ "https":
/*!************************!*\
  !*** external "https" ***!
  \************************/
/***/ ((module) => {

module.exports = require("https");

/***/ }),

/***/ "querystring":
/*!******************************!*\
  !*** external "querystring" ***!
  \******************************/
/***/ ((module) => {

module.exports = require("querystring");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/***/ ((module) => {

module.exports = require("url");

/***/ }),

/***/ "util":
/*!***********************!*\
  !*** external "util" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("util");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("zlib");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute&page=%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!***********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute&page=%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \***********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   originalPathname: () => (/* binding */ originalPathname),\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   requestAsyncStorage: () => (/* binding */ requestAsyncStorage),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   staticGenerationAsyncStorage: () => (/* binding */ staticGenerationAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/future/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/future/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/future/route-kind */ \"(rsc)/./node_modules/next/dist/server/future/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var C_Users_user_Downloads_dental_erp_claudecode_dental_erp_src_app_api_reports_payroll_summary_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./src/app/api/reports/payroll/summary/route.ts */ \"(rsc)/./src/app/api/reports/payroll/summary/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/reports/payroll/summary/route\",\n        pathname: \"/api/reports/payroll/summary\",\n        filename: \"route\",\n        bundlePath: \"app/api/reports/payroll/summary/route\"\n    },\n    resolvedPagePath: \"C:\\\\Users\\\\user\\\\Downloads\\\\dental-erp-claudecode\\\\dental-erp\\\\src\\\\app\\\\api\\\\reports\\\\payroll\\\\summary\\\\route.ts\",\n    nextConfigOutput,\n    userland: C_Users_user_Downloads_dental_erp_claudecode_dental_erp_src_app_api_reports_payroll_summary_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } = routeModule;\nconst originalPathname = \"/api/reports/payroll/summary/route\";\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        serverHooks,\n        staticGenerationAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIuanM/bmFtZT1hcHAlMkZhcGklMkZyZXBvcnRzJTJGcGF5cm9sbCUyRnN1bW1hcnklMkZyb3V0ZSZwYWdlPSUyRmFwaSUyRnJlcG9ydHMlMkZwYXlyb2xsJTJGc3VtbWFyeSUyRnJvdXRlJmFwcFBhdGhzPSZwYWdlUGF0aD1wcml2YXRlLW5leHQtYXBwLWRpciUyRmFwaSUyRnJlcG9ydHMlMkZwYXlyb2xsJTJGc3VtbWFyeSUyRnJvdXRlLnRzJmFwcERpcj1DJTNBJTVDVXNlcnMlNUN1c2VyJTVDRG93bmxvYWRzJTVDZGVudGFsLWVycC1jbGF1ZGVjb2RlJTVDZGVudGFsLWVycCU1Q3NyYyU1Q2FwcCZwYWdlRXh0ZW5zaW9ucz10c3gmcGFnZUV4dGVuc2lvbnM9dHMmcGFnZUV4dGVuc2lvbnM9anN4JnBhZ2VFeHRlbnNpb25zPWpzJnJvb3REaXI9QyUzQSU1Q1VzZXJzJTVDdXNlciU1Q0Rvd25sb2FkcyU1Q2RlbnRhbC1lcnAtY2xhdWRlY29kZSU1Q2RlbnRhbC1lcnAmaXNEZXY9dHJ1ZSZ0c2NvbmZpZ1BhdGg9dHNjb25maWcuanNvbiZiYXNlUGF0aD0mYXNzZXRQcmVmaXg9Jm5leHRDb25maWdPdXRwdXQ9JnByZWZlcnJlZFJlZ2lvbj0mbWlkZGxld2FyZUNvbmZpZz1lMzAlM0QhIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFzRztBQUN2QztBQUNjO0FBQ2lFO0FBQzlJO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QixnSEFBbUI7QUFDM0M7QUFDQSxjQUFjLHlFQUFTO0FBQ3ZCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQSxZQUFZO0FBQ1osQ0FBQztBQUNEO0FBQ0E7QUFDQTtBQUNBLFFBQVEsaUVBQWlFO0FBQ3pFO0FBQ0E7QUFDQSxXQUFXLDRFQUFXO0FBQ3RCO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDdUg7O0FBRXZIIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vZGVudGFsLWVycC8/MTY4YiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLW1vZHVsZXMvYXBwLXJvdXRlL21vZHVsZS5jb21waWxlZFwiO1xuaW1wb3J0IHsgUm91dGVLaW5kIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLWtpbmRcIjtcbmltcG9ydCB7IHBhdGNoRmV0Y2ggYXMgX3BhdGNoRmV0Y2ggfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9saWIvcGF0Y2gtZmV0Y2hcIjtcbmltcG9ydCAqIGFzIHVzZXJsYW5kIGZyb20gXCJDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXERvd25sb2Fkc1xcXFxkZW50YWwtZXJwLWNsYXVkZWNvZGVcXFxcZGVudGFsLWVycFxcXFxzcmNcXFxcYXBwXFxcXGFwaVxcXFxyZXBvcnRzXFxcXHBheXJvbGxcXFxcc3VtbWFyeVxcXFxyb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hcGkvcmVwb3J0cy9wYXlyb2xsL3N1bW1hcnkvcm91dGVcIixcbiAgICAgICAgcGF0aG5hbWU6IFwiL2FwaS9yZXBvcnRzL3BheXJvbGwvc3VtbWFyeVwiLFxuICAgICAgICBmaWxlbmFtZTogXCJyb3V0ZVwiLFxuICAgICAgICBidW5kbGVQYXRoOiBcImFwcC9hcGkvcmVwb3J0cy9wYXlyb2xsL3N1bW1hcnkvcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCJDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXERvd25sb2Fkc1xcXFxkZW50YWwtZXJwLWNsYXVkZWNvZGVcXFxcZGVudGFsLWVycFxcXFxzcmNcXFxcYXBwXFxcXGFwaVxcXFxyZXBvcnRzXFxcXHBheXJvbGxcXFxcc3VtbWFyeVxcXFxyb3V0ZS50c1wiLFxuICAgIG5leHRDb25maWdPdXRwdXQsXG4gICAgdXNlcmxhbmRcbn0pO1xuLy8gUHVsbCBvdXQgdGhlIGV4cG9ydHMgdGhhdCB3ZSBuZWVkIHRvIGV4cG9zZSBmcm9tIHRoZSBtb2R1bGUuIFRoaXMgc2hvdWxkXG4vLyBiZSBlbGltaW5hdGVkIHdoZW4gd2UndmUgbW92ZWQgdGhlIG90aGVyIHJvdXRlcyB0byB0aGUgbmV3IGZvcm1hdC4gVGhlc2Vcbi8vIGFyZSB1c2VkIHRvIGhvb2sgaW50byB0aGUgcm91dGUuXG5jb25zdCB7IHJlcXVlc3RBc3luY1N0b3JhZ2UsIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzIH0gPSByb3V0ZU1vZHVsZTtcbmNvbnN0IG9yaWdpbmFsUGF0aG5hbWUgPSBcIi9hcGkvcmVwb3J0cy9wYXlyb2xsL3N1bW1hcnkvcm91dGVcIjtcbmZ1bmN0aW9uIHBhdGNoRmV0Y2goKSB7XG4gICAgcmV0dXJuIF9wYXRjaEZldGNoKHtcbiAgICAgICAgc2VydmVySG9va3MsXG4gICAgICAgIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2VcbiAgICB9KTtcbn1cbmV4cG9ydCB7IHJvdXRlTW9kdWxlLCByZXF1ZXN0QXN5bmNTdG9yYWdlLCBzdGF0aWNHZW5lcmF0aW9uQXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgb3JpZ2luYWxQYXRobmFtZSwgcGF0Y2hGZXRjaCwgIH07XG5cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwcC1yb3V0ZS5qcy5tYXAiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute&page=%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./src/app/api/reports/payroll/summary/route.ts":
/*!******************************************************!*\
  !*** ./src/app/api/reports/payroll/summary/route.ts ***!
  \******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ GET)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var next_auth__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next-auth */ \"(rsc)/./node_modules/next-auth/index.js\");\n/* harmony import */ var next_auth__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(next_auth__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var _lib_auth__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @/lib/auth */ \"(rsc)/./src/lib/auth.ts\");\n/* harmony import */ var _lib_prisma__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @/lib/prisma */ \"(rsc)/./src/lib/prisma.ts\");\n\n\n\n\nasync function GET(req) {\n    const session = await (0,next_auth__WEBPACK_IMPORTED_MODULE_1__.getServerSession)(_lib_auth__WEBPACK_IMPORTED_MODULE_2__.authOptions);\n    const role = session?.user?.role;\n    if (![\n        \"SUPER_ADMIN\",\n        \"FINANCE\"\n    ].includes(role)) return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n        error: \"Forbidden\"\n    }, {\n        status: 403\n    });\n    const sp = req.nextUrl.searchParams;\n    const clinicId = sp.get(\"clinicId\");\n    const year = Number(sp.get(\"year\")) || new Date().getFullYear();\n    const runs = await _lib_prisma__WEBPACK_IMPORTED_MODULE_3__.prisma.payrollRun.findMany({\n        where: {\n            ...clinicId ? {\n                clinicId\n            } : {},\n            month: {\n                startsWith: `${year}-`\n            }\n        },\n        include: {\n            _count: {\n                select: {\n                    slips: true\n                }\n            },\n            slips: {\n                select: {\n                    eisEmployee: true,\n                    eisEmployer: true\n                }\n            }\n        }\n    });\n    // aggregate per month\n    const byMonth = new Map();\n    for(let m = 1; m <= 12; m++){\n        const key = `${year}-${String(m).padStart(2, \"0\")}`;\n        byMonth.set(key, {\n            month: key,\n            totalGross: 0,\n            totalNet: 0,\n            totalEpf: 0,\n            totalSocso: 0,\n            totalEis: 0,\n            totalTax: 0,\n            staffCount: 0\n        });\n    }\n    for (const r of runs){\n        const e = byMonth.get(r.month);\n        if (!e) continue;\n        e.totalGross += Number(r.totalGross);\n        e.totalNet += Number(r.totalNet);\n        e.totalEpf += Number(r.totalEpf);\n        e.totalSocso += Number(r.totalSocso);\n        e.totalTax += Number(r.totalTax);\n        e.totalEis += r.slips.reduce((s, sl)=>s + Number(sl.eisEmployee) + Number(sl.eisEmployer), 0);\n        e.staffCount += r._count.slips;\n    }\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json([\n        ...byMonth.values()\n    ]);\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvYXBwL2FwaS9yZXBvcnRzL3BheXJvbGwvc3VtbWFyeS9yb3V0ZS50cyIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBd0Q7QUFDWDtBQUNKO0FBQ0g7QUFFL0IsZUFBZUksSUFBSUMsR0FBZ0I7SUFDeEMsTUFBTUMsVUFBVSxNQUFNTCwyREFBZ0JBLENBQUNDLGtEQUFXQTtJQUNsRCxNQUFNSyxPQUFRRCxTQUFTRSxNQUFjRDtJQUNyQyxJQUFJLENBQUM7UUFBQztRQUFlO0tBQVUsQ0FBQ0UsUUFBUSxDQUFDRixPQUFPLE9BQU9QLHFEQUFZQSxDQUFDVSxJQUFJLENBQUM7UUFBRUMsT0FBTztJQUFZLEdBQUc7UUFBRUMsUUFBUTtJQUFJO0lBRS9HLE1BQU1DLEtBQUtSLElBQUlTLE9BQU8sQ0FBQ0MsWUFBWTtJQUNuQyxNQUFNQyxXQUFXSCxHQUFHSSxHQUFHLENBQUM7SUFDeEIsTUFBTUMsT0FBT0MsT0FBT04sR0FBR0ksR0FBRyxDQUFDLFlBQVksSUFBSUcsT0FBT0MsV0FBVztJQUU3RCxNQUFNQyxPQUFPLE1BQU1uQiwrQ0FBTUEsQ0FBQ29CLFVBQVUsQ0FBQ0MsUUFBUSxDQUFDO1FBQzVDQyxPQUFPO1lBQUUsR0FBSVQsV0FBVztnQkFBRUE7WUFBUyxJQUFJLENBQUMsQ0FBQztZQUFHVSxPQUFPO2dCQUFFQyxZQUFZLENBQUMsRUFBRVQsS0FBSyxDQUFDLENBQUM7WUFBQztRQUFFO1FBQzlFVSxTQUFTO1lBQUVDLFFBQVE7Z0JBQUVDLFFBQVE7b0JBQUVDLE9BQU87Z0JBQUs7WUFBRTtZQUFHQSxPQUFPO2dCQUFFRCxRQUFRO29CQUFFRSxhQUFhO29CQUFNQyxhQUFhO2dCQUFLO1lBQUU7UUFBRTtJQUM5RztJQUVBLHNCQUFzQjtJQUN0QixNQUFNQyxVQUFVLElBQUlDO0lBQ3BCLElBQUssSUFBSUMsSUFBSSxHQUFHQSxLQUFLLElBQUlBLElBQUs7UUFDNUIsTUFBTUMsTUFBTSxDQUFDLEVBQUVuQixLQUFLLENBQUMsRUFBRW9CLE9BQU9GLEdBQUdHLFFBQVEsQ0FBQyxHQUFHLEtBQUssQ0FBQztRQUNuREwsUUFBUU0sR0FBRyxDQUFDSCxLQUFLO1lBQUVYLE9BQU9XO1lBQUtJLFlBQVk7WUFBR0MsVUFBVTtZQUFHQyxVQUFVO1lBQUdDLFlBQVk7WUFBR0MsVUFBVTtZQUFHQyxVQUFVO1lBQUdDLFlBQVk7UUFBRTtJQUNqSTtJQUNBLEtBQUssTUFBTUMsS0FBSzFCLEtBQU07UUFDcEIsTUFBTTJCLElBQUlmLFFBQVFqQixHQUFHLENBQUMrQixFQUFFdEIsS0FBSztRQUM3QixJQUFJLENBQUN1QixHQUFHO1FBQ1JBLEVBQUVSLFVBQVUsSUFBSXRCLE9BQU82QixFQUFFUCxVQUFVO1FBQ25DUSxFQUFFUCxRQUFRLElBQUl2QixPQUFPNkIsRUFBRU4sUUFBUTtRQUMvQk8sRUFBRU4sUUFBUSxJQUFJeEIsT0FBTzZCLEVBQUVMLFFBQVE7UUFDL0JNLEVBQUVMLFVBQVUsSUFBSXpCLE9BQU82QixFQUFFSixVQUFVO1FBQ25DSyxFQUFFSCxRQUFRLElBQUkzQixPQUFPNkIsRUFBRUYsUUFBUTtRQUMvQkcsRUFBRUosUUFBUSxJQUFJRyxFQUFFakIsS0FBSyxDQUFDbUIsTUFBTSxDQUFDLENBQUNDLEdBQUdDLEtBQU9ELElBQUloQyxPQUFPaUMsR0FBR3BCLFdBQVcsSUFBSWIsT0FBT2lDLEdBQUduQixXQUFXLEdBQUc7UUFDN0ZnQixFQUFFRixVQUFVLElBQUlDLEVBQUVuQixNQUFNLENBQUNFLEtBQUs7SUFDaEM7SUFFQSxPQUFPL0IscURBQVlBLENBQUNVLElBQUksQ0FBQztXQUFJd0IsUUFBUW1CLE1BQU07S0FBRztBQUNoRCIsInNvdXJjZXMiOlsid2VicGFjazovL2RlbnRhbC1lcnAvLi9zcmMvYXBwL2FwaS9yZXBvcnRzL3BheXJvbGwvc3VtbWFyeS9yb3V0ZS50cz82OWE4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE5leHRSZXF1ZXN0LCBOZXh0UmVzcG9uc2UgfSBmcm9tIFwibmV4dC9zZXJ2ZXJcIjtcbmltcG9ydCB7IGdldFNlcnZlclNlc3Npb24gfSBmcm9tIFwibmV4dC1hdXRoXCI7XG5pbXBvcnQgeyBhdXRoT3B0aW9ucyB9IGZyb20gXCJAL2xpYi9hdXRoXCI7XG5pbXBvcnQgeyBwcmlzbWEgfSBmcm9tIFwiQC9saWIvcHJpc21hXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBHRVQocmVxOiBOZXh0UmVxdWVzdCkge1xuICBjb25zdCBzZXNzaW9uID0gYXdhaXQgZ2V0U2VydmVyU2Vzc2lvbihhdXRoT3B0aW9ucyk7XG4gIGNvbnN0IHJvbGUgPSAoc2Vzc2lvbj8udXNlciBhcyBhbnkpPy5yb2xlO1xuICBpZiAoIVtcIlNVUEVSX0FETUlOXCIsIFwiRklOQU5DRVwiXS5pbmNsdWRlcyhyb2xlKSkgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSwgeyBzdGF0dXM6IDQwMyB9KTtcblxuICBjb25zdCBzcCA9IHJlcS5uZXh0VXJsLnNlYXJjaFBhcmFtcztcbiAgY29uc3QgY2xpbmljSWQgPSBzcC5nZXQoXCJjbGluaWNJZFwiKTtcbiAgY29uc3QgeWVhciA9IE51bWJlcihzcC5nZXQoXCJ5ZWFyXCIpKSB8fCBuZXcgRGF0ZSgpLmdldEZ1bGxZZWFyKCk7XG5cbiAgY29uc3QgcnVucyA9IGF3YWl0IHByaXNtYS5wYXlyb2xsUnVuLmZpbmRNYW55KHtcbiAgICB3aGVyZTogeyAuLi4oY2xpbmljSWQgPyB7IGNsaW5pY0lkIH0gOiB7fSksIG1vbnRoOiB7IHN0YXJ0c1dpdGg6IGAke3llYXJ9LWAgfSB9LFxuICAgIGluY2x1ZGU6IHsgX2NvdW50OiB7IHNlbGVjdDogeyBzbGlwczogdHJ1ZSB9IH0sIHNsaXBzOiB7IHNlbGVjdDogeyBlaXNFbXBsb3llZTogdHJ1ZSwgZWlzRW1wbG95ZXI6IHRydWUgfSB9IH0sXG4gIH0pO1xuXG4gIC8vIGFnZ3JlZ2F0ZSBwZXIgbW9udGhcbiAgY29uc3QgYnlNb250aCA9IG5ldyBNYXA8c3RyaW5nLCBhbnk+KCk7XG4gIGZvciAobGV0IG0gPSAxOyBtIDw9IDEyOyBtKyspIHtcbiAgICBjb25zdCBrZXkgPSBgJHt5ZWFyfS0ke1N0cmluZyhtKS5wYWRTdGFydCgyLCBcIjBcIil9YDtcbiAgICBieU1vbnRoLnNldChrZXksIHsgbW9udGg6IGtleSwgdG90YWxHcm9zczogMCwgdG90YWxOZXQ6IDAsIHRvdGFsRXBmOiAwLCB0b3RhbFNvY3NvOiAwLCB0b3RhbEVpczogMCwgdG90YWxUYXg6IDAsIHN0YWZmQ291bnQ6IDAgfSk7XG4gIH1cbiAgZm9yIChjb25zdCByIG9mIHJ1bnMpIHtcbiAgICBjb25zdCBlID0gYnlNb250aC5nZXQoci5tb250aCk7XG4gICAgaWYgKCFlKSBjb250aW51ZTtcbiAgICBlLnRvdGFsR3Jvc3MgKz0gTnVtYmVyKHIudG90YWxHcm9zcyk7XG4gICAgZS50b3RhbE5ldCArPSBOdW1iZXIoci50b3RhbE5ldCk7XG4gICAgZS50b3RhbEVwZiArPSBOdW1iZXIoci50b3RhbEVwZik7XG4gICAgZS50b3RhbFNvY3NvICs9IE51bWJlcihyLnRvdGFsU29jc28pO1xuICAgIGUudG90YWxUYXggKz0gTnVtYmVyKHIudG90YWxUYXgpO1xuICAgIGUudG90YWxFaXMgKz0gci5zbGlwcy5yZWR1Y2UoKHMsIHNsKSA9PiBzICsgTnVtYmVyKHNsLmVpc0VtcGxveWVlKSArIE51bWJlcihzbC5laXNFbXBsb3llciksIDApO1xuICAgIGUuc3RhZmZDb3VudCArPSByLl9jb3VudC5zbGlwcztcbiAgfVxuXG4gIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihbLi4uYnlNb250aC52YWx1ZXMoKV0pO1xufVxuIl0sIm5hbWVzIjpbIk5leHRSZXNwb25zZSIsImdldFNlcnZlclNlc3Npb24iLCJhdXRoT3B0aW9ucyIsInByaXNtYSIsIkdFVCIsInJlcSIsInNlc3Npb24iLCJyb2xlIiwidXNlciIsImluY2x1ZGVzIiwianNvbiIsImVycm9yIiwic3RhdHVzIiwic3AiLCJuZXh0VXJsIiwic2VhcmNoUGFyYW1zIiwiY2xpbmljSWQiLCJnZXQiLCJ5ZWFyIiwiTnVtYmVyIiwiRGF0ZSIsImdldEZ1bGxZZWFyIiwicnVucyIsInBheXJvbGxSdW4iLCJmaW5kTWFueSIsIndoZXJlIiwibW9udGgiLCJzdGFydHNXaXRoIiwiaW5jbHVkZSIsIl9jb3VudCIsInNlbGVjdCIsInNsaXBzIiwiZWlzRW1wbG95ZWUiLCJlaXNFbXBsb3llciIsImJ5TW9udGgiLCJNYXAiLCJtIiwia2V5IiwiU3RyaW5nIiwicGFkU3RhcnQiLCJzZXQiLCJ0b3RhbEdyb3NzIiwidG90YWxOZXQiLCJ0b3RhbEVwZiIsInRvdGFsU29jc28iLCJ0b3RhbEVpcyIsInRvdGFsVGF4Iiwic3RhZmZDb3VudCIsInIiLCJlIiwicmVkdWNlIiwicyIsInNsIiwidmFsdWVzIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./src/app/api/reports/payroll/summary/route.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/auth.ts":
/*!*************************!*\
  !*** ./src/lib/auth.ts ***!
  \*************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   authOptions: () => (/* binding */ authOptions)\n/* harmony export */ });\n/* harmony import */ var _auth_prisma_adapter__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @auth/prisma-adapter */ \"(rsc)/./node_modules/@auth/prisma-adapter/index.js\");\n/* harmony import */ var next_auth_providers_credentials__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next-auth/providers/credentials */ \"(rsc)/./node_modules/next-auth/providers/credentials.js\");\n/* harmony import */ var bcryptjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! bcryptjs */ \"(rsc)/./node_modules/bcryptjs/index.js\");\n/* harmony import */ var bcryptjs__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(bcryptjs__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _prisma__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./prisma */ \"(rsc)/./src/lib/prisma.ts\");\n\n\n\n\nconst authOptions = {\n    adapter: (0,_auth_prisma_adapter__WEBPACK_IMPORTED_MODULE_0__.PrismaAdapter)(_prisma__WEBPACK_IMPORTED_MODULE_3__.prisma),\n    session: {\n        strategy: \"jwt\"\n    },\n    providers: [\n        (0,next_auth_providers_credentials__WEBPACK_IMPORTED_MODULE_1__[\"default\"])({\n            name: \"credentials\",\n            credentials: {\n                email: {\n                    label: \"Email\",\n                    type: \"email\"\n                },\n                password: {\n                    label: \"Password\",\n                    type: \"password\"\n                }\n            },\n            async authorize (credentials) {\n                if (!credentials?.email || !credentials?.password) return null;\n                const user = await _prisma__WEBPACK_IMPORTED_MODULE_3__.prisma.user.findUnique({\n                    where: {\n                        email: credentials.email\n                    }\n                });\n                if (!user || !user.active) return null;\n                const valid = await bcryptjs__WEBPACK_IMPORTED_MODULE_2___default().compare(credentials.password, user.passwordHash);\n                if (!valid) return null;\n                return {\n                    id: user.id,\n                    name: user.name,\n                    email: user.email,\n                    role: user.role\n                };\n            }\n        })\n    ],\n    callbacks: {\n        jwt ({ token, user }) {\n            if (user) token.role = user.role;\n            return token;\n        },\n        session ({ session, token }) {\n            if (session.user) session.user.role = token.role;\n            return session;\n        }\n    },\n    pages: {\n        signIn: \"/login\"\n    }\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL2F1dGgudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQXFEO0FBRWE7QUFDcEM7QUFDSTtBQUUzQixNQUFNSSxjQUErQjtJQUMxQ0MsU0FBU0wsbUVBQWFBLENBQUNHLDJDQUFNQTtJQUM3QkcsU0FBUztRQUFFQyxVQUFVO0lBQU07SUFDM0JDLFdBQVc7UUFDVFAsMkVBQW1CQSxDQUFDO1lBQ2xCUSxNQUFNO1lBQ05DLGFBQWE7Z0JBQ1hDLE9BQU87b0JBQUVDLE9BQU87b0JBQVNDLE1BQU07Z0JBQVE7Z0JBQ3ZDQyxVQUFVO29CQUFFRixPQUFPO29CQUFZQyxNQUFNO2dCQUFXO1lBQ2xEO1lBQ0EsTUFBTUUsV0FBVUwsV0FBVztnQkFDekIsSUFBSSxDQUFDQSxhQUFhQyxTQUFTLENBQUNELGFBQWFJLFVBQVUsT0FBTztnQkFFMUQsTUFBTUUsT0FBTyxNQUFNYiwyQ0FBTUEsQ0FBQ2EsSUFBSSxDQUFDQyxVQUFVLENBQUM7b0JBQ3hDQyxPQUFPO3dCQUFFUCxPQUFPRCxZQUFZQyxLQUFLO29CQUFDO2dCQUNwQztnQkFDQSxJQUFJLENBQUNLLFFBQVEsQ0FBQ0EsS0FBS0csTUFBTSxFQUFFLE9BQU87Z0JBRWxDLE1BQU1DLFFBQVEsTUFBTWxCLHVEQUFjLENBQUNRLFlBQVlJLFFBQVEsRUFBRUUsS0FBS00sWUFBWTtnQkFDMUUsSUFBSSxDQUFDRixPQUFPLE9BQU87Z0JBRW5CLE9BQU87b0JBQUVHLElBQUlQLEtBQUtPLEVBQUU7b0JBQUVkLE1BQU1PLEtBQUtQLElBQUk7b0JBQUVFLE9BQU9LLEtBQUtMLEtBQUs7b0JBQUVhLE1BQU1SLEtBQUtRLElBQUk7Z0JBQUM7WUFDNUU7UUFDRjtLQUNEO0lBQ0RDLFdBQVc7UUFDVEMsS0FBSSxFQUFFQyxLQUFLLEVBQUVYLElBQUksRUFBRTtZQUNqQixJQUFJQSxNQUFNVyxNQUFNSCxJQUFJLEdBQUcsS0FBY0EsSUFBSTtZQUN6QyxPQUFPRztRQUNUO1FBQ0FyQixTQUFRLEVBQUVBLE9BQU8sRUFBRXFCLEtBQUssRUFBRTtZQUN4QixJQUFJckIsUUFBUVUsSUFBSSxFQUFFLFFBQVNBLElBQUksQ0FBU1EsSUFBSSxHQUFHRyxNQUFNSCxJQUFJO1lBQ3pELE9BQU9sQjtRQUNUO0lBQ0Y7SUFDQXNCLE9BQU87UUFBRUMsUUFBUTtJQUFTO0FBQzVCLEVBQUUiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9kZW50YWwtZXJwLy4vc3JjL2xpYi9hdXRoLnRzPzY2OTIiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUHJpc21hQWRhcHRlciB9IGZyb20gXCJAYXV0aC9wcmlzbWEtYWRhcHRlclwiO1xuaW1wb3J0IHsgTmV4dEF1dGhPcHRpb25zIH0gZnJvbSBcIm5leHQtYXV0aFwiO1xuaW1wb3J0IENyZWRlbnRpYWxzUHJvdmlkZXIgZnJvbSBcIm5leHQtYXV0aC9wcm92aWRlcnMvY3JlZGVudGlhbHNcIjtcbmltcG9ydCBiY3J5cHQgZnJvbSBcImJjcnlwdGpzXCI7XG5pbXBvcnQgeyBwcmlzbWEgfSBmcm9tIFwiLi9wcmlzbWFcIjtcblxuZXhwb3J0IGNvbnN0IGF1dGhPcHRpb25zOiBOZXh0QXV0aE9wdGlvbnMgPSB7XG4gIGFkYXB0ZXI6IFByaXNtYUFkYXB0ZXIocHJpc21hKSBhcyBhbnksXG4gIHNlc3Npb246IHsgc3RyYXRlZ3k6IFwiand0XCIgfSxcbiAgcHJvdmlkZXJzOiBbXG4gICAgQ3JlZGVudGlhbHNQcm92aWRlcih7XG4gICAgICBuYW1lOiBcImNyZWRlbnRpYWxzXCIsXG4gICAgICBjcmVkZW50aWFsczoge1xuICAgICAgICBlbWFpbDogeyBsYWJlbDogXCJFbWFpbFwiLCB0eXBlOiBcImVtYWlsXCIgfSxcbiAgICAgICAgcGFzc3dvcmQ6IHsgbGFiZWw6IFwiUGFzc3dvcmRcIiwgdHlwZTogXCJwYXNzd29yZFwiIH0sXG4gICAgICB9LFxuICAgICAgYXN5bmMgYXV0aG9yaXplKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgIGlmICghY3JlZGVudGlhbHM/LmVtYWlsIHx8ICFjcmVkZW50aWFscz8ucGFzc3dvcmQpIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IHVzZXIgPSBhd2FpdCBwcmlzbWEudXNlci5maW5kVW5pcXVlKHtcbiAgICAgICAgICB3aGVyZTogeyBlbWFpbDogY3JlZGVudGlhbHMuZW1haWwgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICghdXNlciB8fCAhdXNlci5hY3RpdmUpIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IHZhbGlkID0gYXdhaXQgYmNyeXB0LmNvbXBhcmUoY3JlZGVudGlhbHMucGFzc3dvcmQsIHVzZXIucGFzc3dvcmRIYXNoKTtcbiAgICAgICAgaWYgKCF2YWxpZCkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgcmV0dXJuIHsgaWQ6IHVzZXIuaWQsIG5hbWU6IHVzZXIubmFtZSwgZW1haWw6IHVzZXIuZW1haWwsIHJvbGU6IHVzZXIucm9sZSB9O1xuICAgICAgfSxcbiAgICB9KSxcbiAgXSxcbiAgY2FsbGJhY2tzOiB7XG4gICAgand0KHsgdG9rZW4sIHVzZXIgfSkge1xuICAgICAgaWYgKHVzZXIpIHRva2VuLnJvbGUgPSAodXNlciBhcyBhbnkpLnJvbGU7XG4gICAgICByZXR1cm4gdG9rZW47XG4gICAgfSxcbiAgICBzZXNzaW9uKHsgc2Vzc2lvbiwgdG9rZW4gfSkge1xuICAgICAgaWYgKHNlc3Npb24udXNlcikgKHNlc3Npb24udXNlciBhcyBhbnkpLnJvbGUgPSB0b2tlbi5yb2xlO1xuICAgICAgcmV0dXJuIHNlc3Npb247XG4gICAgfSxcbiAgfSxcbiAgcGFnZXM6IHsgc2lnbkluOiBcIi9sb2dpblwiIH0sXG59O1xuIl0sIm5hbWVzIjpbIlByaXNtYUFkYXB0ZXIiLCJDcmVkZW50aWFsc1Byb3ZpZGVyIiwiYmNyeXB0IiwicHJpc21hIiwiYXV0aE9wdGlvbnMiLCJhZGFwdGVyIiwic2Vzc2lvbiIsInN0cmF0ZWd5IiwicHJvdmlkZXJzIiwibmFtZSIsImNyZWRlbnRpYWxzIiwiZW1haWwiLCJsYWJlbCIsInR5cGUiLCJwYXNzd29yZCIsImF1dGhvcml6ZSIsInVzZXIiLCJmaW5kVW5pcXVlIiwid2hlcmUiLCJhY3RpdmUiLCJ2YWxpZCIsImNvbXBhcmUiLCJwYXNzd29yZEhhc2giLCJpZCIsInJvbGUiLCJjYWxsYmFja3MiLCJqd3QiLCJ0b2tlbiIsInBhZ2VzIiwic2lnbkluIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/auth.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/prisma.ts":
/*!***************************!*\
  !*** ./src/lib/prisma.ts ***!
  \***************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   prisma: () => (/* binding */ prisma)\n/* harmony export */ });\n/* harmony import */ var _prisma_client__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @prisma/client */ \"@prisma/client\");\n/* harmony import */ var _prisma_client__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_prisma_client__WEBPACK_IMPORTED_MODULE_0__);\n\nconst globalForPrisma = globalThis;\nconst prisma = globalForPrisma.prisma ?? new _prisma_client__WEBPACK_IMPORTED_MODULE_0__.PrismaClient({\n    log: [\n        \"error\"\n    ]\n});\nif (true) globalForPrisma.prisma = prisma;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL3ByaXNtYS50cyIsIm1hcHBpbmdzIjoiOzs7Ozs7QUFBOEM7QUFFOUMsTUFBTUMsa0JBQWtCQztBQUVqQixNQUFNQyxTQUNYRixnQkFBZ0JFLE1BQU0sSUFBSSxJQUFJSCx3REFBWUEsQ0FBQztJQUFFSSxLQUFLO1FBQUM7S0FBUTtBQUFDLEdBQUc7QUFFakUsSUFBSUMsSUFBcUMsRUFBRUosZ0JBQWdCRSxNQUFNLEdBQUdBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vZGVudGFsLWVycC8uL3NyYy9saWIvcHJpc21hLnRzPzAxZDciXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUHJpc21hQ2xpZW50IH0gZnJvbSBcIkBwcmlzbWEvY2xpZW50XCI7XG5cbmNvbnN0IGdsb2JhbEZvclByaXNtYSA9IGdsb2JhbFRoaXMgYXMgdW5rbm93biBhcyB7IHByaXNtYTogUHJpc21hQ2xpZW50IH07XG5cbmV4cG9ydCBjb25zdCBwcmlzbWEgPVxuICBnbG9iYWxGb3JQcmlzbWEucHJpc21hID8/IG5ldyBQcmlzbWFDbGllbnQoeyBsb2c6IFtcImVycm9yXCJdIH0pO1xuXG5pZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09IFwicHJvZHVjdGlvblwiKSBnbG9iYWxGb3JQcmlzbWEucHJpc21hID0gcHJpc21hO1xuIl0sIm5hbWVzIjpbIlByaXNtYUNsaWVudCIsImdsb2JhbEZvclByaXNtYSIsImdsb2JhbFRoaXMiLCJwcmlzbWEiLCJsb2ciLCJwcm9jZXNzIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/prisma.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/next-auth","vendor-chunks/jose","vendor-chunks/openid-client","vendor-chunks/bcryptjs","vendor-chunks/@babel","vendor-chunks/oauth","vendor-chunks/object-hash","vendor-chunks/preact","vendor-chunks/uuid","vendor-chunks/yallist","vendor-chunks/preact-render-to-string","vendor-chunks/lru-cache","vendor-chunks/cookie","vendor-chunks/@auth","vendor-chunks/oidc-token-hash","vendor-chunks/@panva"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute&page=%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Freports%2Fpayroll%2Fsummary%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();