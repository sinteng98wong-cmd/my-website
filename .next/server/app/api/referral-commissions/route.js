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
exports.id = "app/api/referral-commissions/route";
exports.ids = ["app/api/referral-commissions/route"];
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

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Freferral-commissions%2Froute&page=%2Fapi%2Freferral-commissions%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Freferral-commissions%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!**************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Freferral-commissions%2Froute&page=%2Fapi%2Freferral-commissions%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Freferral-commissions%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \**************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   originalPathname: () => (/* binding */ originalPathname),\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   requestAsyncStorage: () => (/* binding */ requestAsyncStorage),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   staticGenerationAsyncStorage: () => (/* binding */ staticGenerationAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/future/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/future/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/future/route-kind */ \"(rsc)/./node_modules/next/dist/server/future/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var C_Users_user_Downloads_dental_erp_claudecode_dental_erp_src_app_api_referral_commissions_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./src/app/api/referral-commissions/route.ts */ \"(rsc)/./src/app/api/referral-commissions/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/referral-commissions/route\",\n        pathname: \"/api/referral-commissions\",\n        filename: \"route\",\n        bundlePath: \"app/api/referral-commissions/route\"\n    },\n    resolvedPagePath: \"C:\\\\Users\\\\user\\\\Downloads\\\\dental-erp-claudecode\\\\dental-erp\\\\src\\\\app\\\\api\\\\referral-commissions\\\\route.ts\",\n    nextConfigOutput,\n    userland: C_Users_user_Downloads_dental_erp_claudecode_dental_erp_src_app_api_referral_commissions_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } = routeModule;\nconst originalPathname = \"/api/referral-commissions/route\";\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        serverHooks,\n        staticGenerationAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIuanM/bmFtZT1hcHAlMkZhcGklMkZyZWZlcnJhbC1jb21taXNzaW9ucyUyRnJvdXRlJnBhZ2U9JTJGYXBpJTJGcmVmZXJyYWwtY29tbWlzc2lvbnMlMkZyb3V0ZSZhcHBQYXRocz0mcGFnZVBhdGg9cHJpdmF0ZS1uZXh0LWFwcC1kaXIlMkZhcGklMkZyZWZlcnJhbC1jb21taXNzaW9ucyUyRnJvdXRlLnRzJmFwcERpcj1DJTNBJTVDVXNlcnMlNUN1c2VyJTVDRG93bmxvYWRzJTVDZGVudGFsLWVycC1jbGF1ZGVjb2RlJTVDZGVudGFsLWVycCU1Q3NyYyU1Q2FwcCZwYWdlRXh0ZW5zaW9ucz10c3gmcGFnZUV4dGVuc2lvbnM9dHMmcGFnZUV4dGVuc2lvbnM9anN4JnBhZ2VFeHRlbnNpb25zPWpzJnJvb3REaXI9QyUzQSU1Q1VzZXJzJTVDdXNlciU1Q0Rvd25sb2FkcyU1Q2RlbnRhbC1lcnAtY2xhdWRlY29kZSU1Q2RlbnRhbC1lcnAmaXNEZXY9dHJ1ZSZ0c2NvbmZpZ1BhdGg9dHNjb25maWcuanNvbiZiYXNlUGF0aD0mYXNzZXRQcmVmaXg9Jm5leHRDb25maWdPdXRwdXQ9JnByZWZlcnJlZFJlZ2lvbj0mbWlkZGxld2FyZUNvbmZpZz1lMzAlM0QhIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFzRztBQUN2QztBQUNjO0FBQzREO0FBQ3pJO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QixnSEFBbUI7QUFDM0M7QUFDQSxjQUFjLHlFQUFTO0FBQ3ZCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQSxZQUFZO0FBQ1osQ0FBQztBQUNEO0FBQ0E7QUFDQTtBQUNBLFFBQVEsaUVBQWlFO0FBQ3pFO0FBQ0E7QUFDQSxXQUFXLDRFQUFXO0FBQ3RCO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDdUg7O0FBRXZIIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vZGVudGFsLWVycC8/ZTBhNyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLW1vZHVsZXMvYXBwLXJvdXRlL21vZHVsZS5jb21waWxlZFwiO1xuaW1wb3J0IHsgUm91dGVLaW5kIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLWtpbmRcIjtcbmltcG9ydCB7IHBhdGNoRmV0Y2ggYXMgX3BhdGNoRmV0Y2ggfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9saWIvcGF0Y2gtZmV0Y2hcIjtcbmltcG9ydCAqIGFzIHVzZXJsYW5kIGZyb20gXCJDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXERvd25sb2Fkc1xcXFxkZW50YWwtZXJwLWNsYXVkZWNvZGVcXFxcZGVudGFsLWVycFxcXFxzcmNcXFxcYXBwXFxcXGFwaVxcXFxyZWZlcnJhbC1jb21taXNzaW9uc1xcXFxyb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hcGkvcmVmZXJyYWwtY29tbWlzc2lvbnMvcm91dGVcIixcbiAgICAgICAgcGF0aG5hbWU6IFwiL2FwaS9yZWZlcnJhbC1jb21taXNzaW9uc1wiLFxuICAgICAgICBmaWxlbmFtZTogXCJyb3V0ZVwiLFxuICAgICAgICBidW5kbGVQYXRoOiBcImFwcC9hcGkvcmVmZXJyYWwtY29tbWlzc2lvbnMvcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCJDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXERvd25sb2Fkc1xcXFxkZW50YWwtZXJwLWNsYXVkZWNvZGVcXFxcZGVudGFsLWVycFxcXFxzcmNcXFxcYXBwXFxcXGFwaVxcXFxyZWZlcnJhbC1jb21taXNzaW9uc1xcXFxyb3V0ZS50c1wiLFxuICAgIG5leHRDb25maWdPdXRwdXQsXG4gICAgdXNlcmxhbmRcbn0pO1xuLy8gUHVsbCBvdXQgdGhlIGV4cG9ydHMgdGhhdCB3ZSBuZWVkIHRvIGV4cG9zZSBmcm9tIHRoZSBtb2R1bGUuIFRoaXMgc2hvdWxkXG4vLyBiZSBlbGltaW5hdGVkIHdoZW4gd2UndmUgbW92ZWQgdGhlIG90aGVyIHJvdXRlcyB0byB0aGUgbmV3IGZvcm1hdC4gVGhlc2Vcbi8vIGFyZSB1c2VkIHRvIGhvb2sgaW50byB0aGUgcm91dGUuXG5jb25zdCB7IHJlcXVlc3RBc3luY1N0b3JhZ2UsIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzIH0gPSByb3V0ZU1vZHVsZTtcbmNvbnN0IG9yaWdpbmFsUGF0aG5hbWUgPSBcIi9hcGkvcmVmZXJyYWwtY29tbWlzc2lvbnMvcm91dGVcIjtcbmZ1bmN0aW9uIHBhdGNoRmV0Y2goKSB7XG4gICAgcmV0dXJuIF9wYXRjaEZldGNoKHtcbiAgICAgICAgc2VydmVySG9va3MsXG4gICAgICAgIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2VcbiAgICB9KTtcbn1cbmV4cG9ydCB7IHJvdXRlTW9kdWxlLCByZXF1ZXN0QXN5bmNTdG9yYWdlLCBzdGF0aWNHZW5lcmF0aW9uQXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgb3JpZ2luYWxQYXRobmFtZSwgcGF0Y2hGZXRjaCwgIH07XG5cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwcC1yb3V0ZS5qcy5tYXAiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Freferral-commissions%2Froute&page=%2Fapi%2Freferral-commissions%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Freferral-commissions%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./src/app/api/referral-commissions/route.ts":
/*!***************************************************!*\
  !*** ./src/app/api/referral-commissions/route.ts ***!
  \***************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ GET),\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var next_auth__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next-auth */ \"(rsc)/./node_modules/next-auth/index.js\");\n/* harmony import */ var next_auth__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(next_auth__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var _lib_auth__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @/lib/auth */ \"(rsc)/./src/lib/auth.ts\");\n/* harmony import */ var _lib_prisma__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @/lib/prisma */ \"(rsc)/./src/lib/prisma.ts\");\n\n\n\n\nfunction guard(session) {\n    return [\n        \"SUPER_ADMIN\",\n        \"FINANCE\"\n    ].includes(session?.user?.role);\n}\nconst INCLUDE = {\n    patient: {\n        select: {\n            id: true,\n            name: true,\n            patientRef: true\n        }\n    },\n    doctor: {\n        select: {\n            id: true,\n            name: true\n        }\n    },\n    clinic: {\n        select: {\n            id: true,\n            name: true\n        }\n    },\n    basedOnInvoice: {\n        select: {\n            id: true,\n            invoiceRef: true,\n            total: true\n        }\n    }\n};\nasync function GET(req) {\n    const session = await (0,next_auth__WEBPACK_IMPORTED_MODULE_1__.getServerSession)(_lib_auth__WEBPACK_IMPORTED_MODULE_2__.authOptions);\n    if (!guard(session)) return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n        error: \"Forbidden\"\n    }, {\n        status: 403\n    });\n    const sp = req.nextUrl.searchParams;\n    const status = sp.get(\"status\");\n    const referralType = sp.get(\"referralType\");\n    const month = sp.get(\"month\"); // YYYY-MM\n    let createdAt = undefined;\n    if (month && /^\\d{4}-\\d{2}$/.test(month)) {\n        const [y, m] = month.split(\"-\").map(Number);\n        createdAt = {\n            gte: new Date(y, m - 1, 1),\n            lt: new Date(y, m, 1)\n        };\n    }\n    const rows = await _lib_prisma__WEBPACK_IMPORTED_MODULE_3__.prisma.referralCommission.findMany({\n        where: {\n            ...status ? {\n                status: status\n            } : {},\n            ...referralType ? {\n                referralType: referralType\n            } : {},\n            ...createdAt ? {\n                createdAt\n            } : {}\n        },\n        include: INCLUDE,\n        orderBy: {\n            createdAt: \"desc\"\n        }\n    });\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(rows);\n}\nasync function POST(req) {\n    const session = await (0,next_auth__WEBPACK_IMPORTED_MODULE_1__.getServerSession)(_lib_auth__WEBPACK_IMPORTED_MODULE_2__.authOptions);\n    if (!guard(session)) return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n        error: \"Forbidden\"\n    }, {\n        status: 403\n    });\n    const b = await req.json();\n    if (!b.patientId || !b.referralType || !b.commissionType || b.rate === undefined) {\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: \"patientId, referralType, commissionType and rate are required\"\n        }, {\n            status: 422\n        });\n    }\n    let calculatedAmount = Number(b.rate);\n    if (b.commissionType === \"PERCENTAGE\") {\n        if (!b.basedOnInvoiceId) return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: \"basedOnInvoiceId required for PERCENTAGE\"\n        }, {\n            status: 422\n        });\n        const inv = await _lib_prisma__WEBPACK_IMPORTED_MODULE_3__.prisma.invoice.findUnique({\n            where: {\n                id: b.basedOnInvoiceId\n            },\n            select: {\n                total: true\n            }\n        });\n        if (!inv) return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: \"Invoice not found\"\n        }, {\n            status: 404\n        });\n        calculatedAmount = Math.round(Number(inv.total) * (Number(b.rate) / 100) * 100) / 100;\n    }\n    const row = await _lib_prisma__WEBPACK_IMPORTED_MODULE_3__.prisma.referralCommission.create({\n        data: {\n            patientId: b.patientId,\n            referralType: b.referralType,\n            doctorId: b.referralType === \"INTERNAL_DOCTOR\" ? b.doctorId || null : null,\n            clinicId: b.referralType === \"INTERNAL_CLINIC\" ? b.clinicId || null : null,\n            externalName: b.referralType === \"EXTERNAL\" ? b.externalName || null : null,\n            commissionType: b.commissionType,\n            rate: b.rate,\n            basedOnInvoiceId: b.basedOnInvoiceId || null,\n            calculatedAmount,\n            notes: b.notes || null\n        },\n        include: INCLUDE\n    });\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(row, {\n        status: 201\n    });\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvYXBwL2FwaS9yZWZlcnJhbC1jb21taXNzaW9ucy9yb3V0ZS50cyIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQXdEO0FBQ1g7QUFDSjtBQUNIO0FBRXRDLFNBQVNJLE1BQU1DLE9BQVk7SUFDekIsT0FBTztRQUFDO1FBQWU7S0FBVSxDQUFDQyxRQUFRLENBQUVELFNBQVNFLE1BQWNDO0FBQ3JFO0FBRUEsTUFBTUMsVUFBVTtJQUNkQyxTQUFTO1FBQUVDLFFBQVE7WUFBRUMsSUFBSTtZQUFNQyxNQUFNO1lBQU1DLFlBQVk7UUFBSztJQUFFO0lBQzlEQyxRQUFTO1FBQUVKLFFBQVE7WUFBRUMsSUFBSTtZQUFNQyxNQUFNO1FBQUs7SUFBRTtJQUM1Q0csUUFBUztRQUFFTCxRQUFRO1lBQUVDLElBQUk7WUFBTUMsTUFBTTtRQUFLO0lBQUU7SUFDNUNJLGdCQUFnQjtRQUFFTixRQUFRO1lBQUVDLElBQUk7WUFBTU0sWUFBWTtZQUFNQyxPQUFPO1FBQUs7SUFBRTtBQUN4RTtBQUVPLGVBQWVDLElBQUlDLEdBQWdCO0lBQ3hDLE1BQU1oQixVQUFVLE1BQU1KLDJEQUFnQkEsQ0FBQ0Msa0RBQVdBO0lBQ2xELElBQUksQ0FBQ0UsTUFBTUMsVUFBVSxPQUFPTCxxREFBWUEsQ0FBQ3NCLElBQUksQ0FBQztRQUFFQyxPQUFPO0lBQVksR0FBRztRQUFFQyxRQUFRO0lBQUk7SUFFcEYsTUFBTUMsS0FBS0osSUFBSUssT0FBTyxDQUFDQyxZQUFZO0lBQ25DLE1BQU1ILFNBQVNDLEdBQUdHLEdBQUcsQ0FBQztJQUN0QixNQUFNQyxlQUFlSixHQUFHRyxHQUFHLENBQUM7SUFDNUIsTUFBTUUsUUFBUUwsR0FBR0csR0FBRyxDQUFDLFVBQVUsVUFBVTtJQUV6QyxJQUFJRyxZQUFpQkM7SUFDckIsSUFBSUYsU0FBUyxnQkFBZ0JHLElBQUksQ0FBQ0gsUUFBUTtRQUN4QyxNQUFNLENBQUNJLEdBQUdDLEVBQUUsR0FBR0wsTUFBTU0sS0FBSyxDQUFDLEtBQUtDLEdBQUcsQ0FBQ0M7UUFDcENQLFlBQVk7WUFBRVEsS0FBSyxJQUFJQyxLQUFLTixHQUFHQyxJQUFJLEdBQUc7WUFBSU0sSUFBSSxJQUFJRCxLQUFLTixHQUFHQyxHQUFHO1FBQUc7SUFDbEU7SUFFQSxNQUFNTyxPQUFPLE1BQU12QywrQ0FBTUEsQ0FBQ3dDLGtCQUFrQixDQUFDQyxRQUFRLENBQUM7UUFDcERDLE9BQU87WUFDTCxHQUFJckIsU0FBUztnQkFBRUEsUUFBUUE7WUFBYyxJQUFJLENBQUMsQ0FBQztZQUMzQyxHQUFJSyxlQUFlO2dCQUFFQSxjQUFjQTtZQUFvQixJQUFJLENBQUMsQ0FBQztZQUM3RCxHQUFJRSxZQUFZO2dCQUFFQTtZQUFVLElBQUksQ0FBQyxDQUFDO1FBQ3BDO1FBQ0FlLFNBQVNyQztRQUNUc0MsU0FBUztZQUFFaEIsV0FBVztRQUFPO0lBQy9CO0lBRUEsT0FBTy9CLHFEQUFZQSxDQUFDc0IsSUFBSSxDQUFDb0I7QUFDM0I7QUFFTyxlQUFlTSxLQUFLM0IsR0FBZ0I7SUFDekMsTUFBTWhCLFVBQVUsTUFBTUosMkRBQWdCQSxDQUFDQyxrREFBV0E7SUFDbEQsSUFBSSxDQUFDRSxNQUFNQyxVQUFVLE9BQU9MLHFEQUFZQSxDQUFDc0IsSUFBSSxDQUFDO1FBQUVDLE9BQU87SUFBWSxHQUFHO1FBQUVDLFFBQVE7SUFBSTtJQUVwRixNQUFNeUIsSUFBSSxNQUFNNUIsSUFBSUMsSUFBSTtJQUN4QixJQUFJLENBQUMyQixFQUFFQyxTQUFTLElBQUksQ0FBQ0QsRUFBRXBCLFlBQVksSUFBSSxDQUFDb0IsRUFBRUUsY0FBYyxJQUFJRixFQUFFRyxJQUFJLEtBQUtwQixXQUFXO1FBQ2hGLE9BQU9oQyxxREFBWUEsQ0FBQ3NCLElBQUksQ0FBQztZQUFFQyxPQUFPO1FBQWdFLEdBQUc7WUFBRUMsUUFBUTtRQUFJO0lBQ3JIO0lBRUEsSUFBSTZCLG1CQUFtQmYsT0FBT1csRUFBRUcsSUFBSTtJQUNwQyxJQUFJSCxFQUFFRSxjQUFjLEtBQUssY0FBYztRQUNyQyxJQUFJLENBQUNGLEVBQUVLLGdCQUFnQixFQUFFLE9BQU90RCxxREFBWUEsQ0FBQ3NCLElBQUksQ0FBQztZQUFFQyxPQUFPO1FBQTJDLEdBQUc7WUFBRUMsUUFBUTtRQUFJO1FBQ3ZILE1BQU0rQixNQUFNLE1BQU1wRCwrQ0FBTUEsQ0FBQ3FELE9BQU8sQ0FBQ0MsVUFBVSxDQUFDO1lBQUVaLE9BQU87Z0JBQUVqQyxJQUFJcUMsRUFBRUssZ0JBQWdCO1lBQUM7WUFBRzNDLFFBQVE7Z0JBQUVRLE9BQU87WUFBSztRQUFFO1FBQ3pHLElBQUksQ0FBQ29DLEtBQUssT0FBT3ZELHFEQUFZQSxDQUFDc0IsSUFBSSxDQUFDO1lBQUVDLE9BQU87UUFBb0IsR0FBRztZQUFFQyxRQUFRO1FBQUk7UUFDakY2QixtQkFBbUJLLEtBQUtDLEtBQUssQ0FBQ3JCLE9BQU9pQixJQUFJcEMsS0FBSyxJQUFLbUIsQ0FBQUEsT0FBT1csRUFBRUcsSUFBSSxJQUFJLEdBQUUsSUFBSyxPQUFPO0lBQ3BGO0lBRUEsTUFBTVEsTUFBTSxNQUFNekQsK0NBQU1BLENBQUN3QyxrQkFBa0IsQ0FBQ2tCLE1BQU0sQ0FBQztRQUNqREMsTUFBTTtZQUNKWixXQUFnQkQsRUFBRUMsU0FBUztZQUMzQnJCLGNBQWdCb0IsRUFBRXBCLFlBQVk7WUFDOUJrQyxVQUFnQmQsRUFBRXBCLFlBQVksS0FBSyxvQkFBb0JvQixFQUFFYyxRQUFRLElBQUksT0FBTztZQUM1RUMsVUFBZ0JmLEVBQUVwQixZQUFZLEtBQUssb0JBQW9Cb0IsRUFBRWUsUUFBUSxJQUFJLE9BQU87WUFDNUVDLGNBQWdCaEIsRUFBRXBCLFlBQVksS0FBSyxhQUFhb0IsRUFBRWdCLFlBQVksSUFBSSxPQUFPO1lBQ3pFZCxnQkFBZ0JGLEVBQUVFLGNBQWM7WUFDaENDLE1BQWdCSCxFQUFFRyxJQUFJO1lBQ3RCRSxrQkFBa0JMLEVBQUVLLGdCQUFnQixJQUFJO1lBQ3hDRDtZQUNBYSxPQUFnQmpCLEVBQUVpQixLQUFLLElBQUk7UUFDN0I7UUFDQXBCLFNBQVNyQztJQUNYO0lBQ0EsT0FBT1QscURBQVlBLENBQUNzQixJQUFJLENBQUNzQyxLQUFLO1FBQUVwQyxRQUFRO0lBQUk7QUFDOUMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9kZW50YWwtZXJwLy4vc3JjL2FwcC9hcGkvcmVmZXJyYWwtY29tbWlzc2lvbnMvcm91dGUudHM/MDQ4OSJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBOZXh0UmVxdWVzdCwgTmV4dFJlc3BvbnNlIH0gZnJvbSBcIm5leHQvc2VydmVyXCI7XG5pbXBvcnQgeyBnZXRTZXJ2ZXJTZXNzaW9uIH0gZnJvbSBcIm5leHQtYXV0aFwiO1xuaW1wb3J0IHsgYXV0aE9wdGlvbnMgfSBmcm9tIFwiQC9saWIvYXV0aFwiO1xuaW1wb3J0IHsgcHJpc21hIH0gZnJvbSBcIkAvbGliL3ByaXNtYVwiO1xuXG5mdW5jdGlvbiBndWFyZChzZXNzaW9uOiBhbnkpIHtcbiAgcmV0dXJuIFtcIlNVUEVSX0FETUlOXCIsIFwiRklOQU5DRVwiXS5pbmNsdWRlcygoc2Vzc2lvbj8udXNlciBhcyBhbnkpPy5yb2xlKTtcbn1cblxuY29uc3QgSU5DTFVERSA9IHtcbiAgcGF0aWVudDogeyBzZWxlY3Q6IHsgaWQ6IHRydWUsIG5hbWU6IHRydWUsIHBhdGllbnRSZWY6IHRydWUgfSB9LFxuICBkb2N0b3I6ICB7IHNlbGVjdDogeyBpZDogdHJ1ZSwgbmFtZTogdHJ1ZSB9IH0sXG4gIGNsaW5pYzogIHsgc2VsZWN0OiB7IGlkOiB0cnVlLCBuYW1lOiB0cnVlIH0gfSxcbiAgYmFzZWRPbkludm9pY2U6IHsgc2VsZWN0OiB7IGlkOiB0cnVlLCBpbnZvaWNlUmVmOiB0cnVlLCB0b3RhbDogdHJ1ZSB9IH0sXG59IGFzIGNvbnN0O1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gR0VUKHJlcTogTmV4dFJlcXVlc3QpIHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGdldFNlcnZlclNlc3Npb24oYXV0aE9wdGlvbnMpO1xuICBpZiAoIWd1YXJkKHNlc3Npb24pKSByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9LCB7IHN0YXR1czogNDAzIH0pO1xuXG4gIGNvbnN0IHNwID0gcmVxLm5leHRVcmwuc2VhcmNoUGFyYW1zO1xuICBjb25zdCBzdGF0dXMgPSBzcC5nZXQoXCJzdGF0dXNcIik7XG4gIGNvbnN0IHJlZmVycmFsVHlwZSA9IHNwLmdldChcInJlZmVycmFsVHlwZVwiKTtcbiAgY29uc3QgbW9udGggPSBzcC5nZXQoXCJtb250aFwiKTsgLy8gWVlZWS1NTVxuXG4gIGxldCBjcmVhdGVkQXQ6IGFueSA9IHVuZGVmaW5lZDtcbiAgaWYgKG1vbnRoICYmIC9eXFxkezR9LVxcZHsyfSQvLnRlc3QobW9udGgpKSB7XG4gICAgY29uc3QgW3ksIG1dID0gbW9udGguc3BsaXQoXCItXCIpLm1hcChOdW1iZXIpO1xuICAgIGNyZWF0ZWRBdCA9IHsgZ3RlOiBuZXcgRGF0ZSh5LCBtIC0gMSwgMSksIGx0OiBuZXcgRGF0ZSh5LCBtLCAxKSB9O1xuICB9XG5cbiAgY29uc3Qgcm93cyA9IGF3YWl0IHByaXNtYS5yZWZlcnJhbENvbW1pc3Npb24uZmluZE1hbnkoe1xuICAgIHdoZXJlOiB7XG4gICAgICAuLi4oc3RhdHVzID8geyBzdGF0dXM6IHN0YXR1cyBhcyBhbnkgfSA6IHt9KSxcbiAgICAgIC4uLihyZWZlcnJhbFR5cGUgPyB7IHJlZmVycmFsVHlwZTogcmVmZXJyYWxUeXBlIGFzIGFueSB9IDoge30pLFxuICAgICAgLi4uKGNyZWF0ZWRBdCA/IHsgY3JlYXRlZEF0IH0gOiB7fSksXG4gICAgfSxcbiAgICBpbmNsdWRlOiBJTkNMVURFLFxuICAgIG9yZGVyQnk6IHsgY3JlYXRlZEF0OiBcImRlc2NcIiB9LFxuICB9KTtcblxuICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24ocm93cyk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBQT1NUKHJlcTogTmV4dFJlcXVlc3QpIHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGdldFNlcnZlclNlc3Npb24oYXV0aE9wdGlvbnMpO1xuICBpZiAoIWd1YXJkKHNlc3Npb24pKSByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9LCB7IHN0YXR1czogNDAzIH0pO1xuXG4gIGNvbnN0IGIgPSBhd2FpdCByZXEuanNvbigpO1xuICBpZiAoIWIucGF0aWVudElkIHx8ICFiLnJlZmVycmFsVHlwZSB8fCAhYi5jb21taXNzaW9uVHlwZSB8fCBiLnJhdGUgPT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IGVycm9yOiBcInBhdGllbnRJZCwgcmVmZXJyYWxUeXBlLCBjb21taXNzaW9uVHlwZSBhbmQgcmF0ZSBhcmUgcmVxdWlyZWRcIiB9LCB7IHN0YXR1czogNDIyIH0pO1xuICB9XG5cbiAgbGV0IGNhbGN1bGF0ZWRBbW91bnQgPSBOdW1iZXIoYi5yYXRlKTtcbiAgaWYgKGIuY29tbWlzc2lvblR5cGUgPT09IFwiUEVSQ0VOVEFHRVwiKSB7XG4gICAgaWYgKCFiLmJhc2VkT25JbnZvaWNlSWQpIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IGVycm9yOiBcImJhc2VkT25JbnZvaWNlSWQgcmVxdWlyZWQgZm9yIFBFUkNFTlRBR0VcIiB9LCB7IHN0YXR1czogNDIyIH0pO1xuICAgIGNvbnN0IGludiA9IGF3YWl0IHByaXNtYS5pbnZvaWNlLmZpbmRVbmlxdWUoeyB3aGVyZTogeyBpZDogYi5iYXNlZE9uSW52b2ljZUlkIH0sIHNlbGVjdDogeyB0b3RhbDogdHJ1ZSB9IH0pO1xuICAgIGlmICghaW52KSByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBlcnJvcjogXCJJbnZvaWNlIG5vdCBmb3VuZFwiIH0sIHsgc3RhdHVzOiA0MDQgfSk7XG4gICAgY2FsY3VsYXRlZEFtb3VudCA9IE1hdGgucm91bmQoTnVtYmVyKGludi50b3RhbCkgKiAoTnVtYmVyKGIucmF0ZSkgLyAxMDApICogMTAwKSAvIDEwMDtcbiAgfVxuXG4gIGNvbnN0IHJvdyA9IGF3YWl0IHByaXNtYS5yZWZlcnJhbENvbW1pc3Npb24uY3JlYXRlKHtcbiAgICBkYXRhOiB7XG4gICAgICBwYXRpZW50SWQ6ICAgICAgYi5wYXRpZW50SWQsXG4gICAgICByZWZlcnJhbFR5cGU6ICAgYi5yZWZlcnJhbFR5cGUsXG4gICAgICBkb2N0b3JJZDogICAgICAgYi5yZWZlcnJhbFR5cGUgPT09IFwiSU5URVJOQUxfRE9DVE9SXCIgPyBiLmRvY3RvcklkIHx8IG51bGwgOiBudWxsLFxuICAgICAgY2xpbmljSWQ6ICAgICAgIGIucmVmZXJyYWxUeXBlID09PSBcIklOVEVSTkFMX0NMSU5JQ1wiID8gYi5jbGluaWNJZCB8fCBudWxsIDogbnVsbCxcbiAgICAgIGV4dGVybmFsTmFtZTogICBiLnJlZmVycmFsVHlwZSA9PT0gXCJFWFRFUk5BTFwiID8gYi5leHRlcm5hbE5hbWUgfHwgbnVsbCA6IG51bGwsXG4gICAgICBjb21taXNzaW9uVHlwZTogYi5jb21taXNzaW9uVHlwZSxcbiAgICAgIHJhdGU6ICAgICAgICAgICBiLnJhdGUsXG4gICAgICBiYXNlZE9uSW52b2ljZUlkOiBiLmJhc2VkT25JbnZvaWNlSWQgfHwgbnVsbCxcbiAgICAgIGNhbGN1bGF0ZWRBbW91bnQsXG4gICAgICBub3RlczogICAgICAgICAgYi5ub3RlcyB8fCBudWxsLFxuICAgIH0sXG4gICAgaW5jbHVkZTogSU5DTFVERSxcbiAgfSk7XG4gIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihyb3csIHsgc3RhdHVzOiAyMDEgfSk7XG59XG4iXSwibmFtZXMiOlsiTmV4dFJlc3BvbnNlIiwiZ2V0U2VydmVyU2Vzc2lvbiIsImF1dGhPcHRpb25zIiwicHJpc21hIiwiZ3VhcmQiLCJzZXNzaW9uIiwiaW5jbHVkZXMiLCJ1c2VyIiwicm9sZSIsIklOQ0xVREUiLCJwYXRpZW50Iiwic2VsZWN0IiwiaWQiLCJuYW1lIiwicGF0aWVudFJlZiIsImRvY3RvciIsImNsaW5pYyIsImJhc2VkT25JbnZvaWNlIiwiaW52b2ljZVJlZiIsInRvdGFsIiwiR0VUIiwicmVxIiwianNvbiIsImVycm9yIiwic3RhdHVzIiwic3AiLCJuZXh0VXJsIiwic2VhcmNoUGFyYW1zIiwiZ2V0IiwicmVmZXJyYWxUeXBlIiwibW9udGgiLCJjcmVhdGVkQXQiLCJ1bmRlZmluZWQiLCJ0ZXN0IiwieSIsIm0iLCJzcGxpdCIsIm1hcCIsIk51bWJlciIsImd0ZSIsIkRhdGUiLCJsdCIsInJvd3MiLCJyZWZlcnJhbENvbW1pc3Npb24iLCJmaW5kTWFueSIsIndoZXJlIiwiaW5jbHVkZSIsIm9yZGVyQnkiLCJQT1NUIiwiYiIsInBhdGllbnRJZCIsImNvbW1pc3Npb25UeXBlIiwicmF0ZSIsImNhbGN1bGF0ZWRBbW91bnQiLCJiYXNlZE9uSW52b2ljZUlkIiwiaW52IiwiaW52b2ljZSIsImZpbmRVbmlxdWUiLCJNYXRoIiwicm91bmQiLCJyb3ciLCJjcmVhdGUiLCJkYXRhIiwiZG9jdG9ySWQiLCJjbGluaWNJZCIsImV4dGVybmFsTmFtZSIsIm5vdGVzIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./src/app/api/referral-commissions/route.ts\n");

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
var __webpack_require__ = require("../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/next-auth","vendor-chunks/jose","vendor-chunks/openid-client","vendor-chunks/bcryptjs","vendor-chunks/@babel","vendor-chunks/oauth","vendor-chunks/object-hash","vendor-chunks/preact","vendor-chunks/uuid","vendor-chunks/yallist","vendor-chunks/preact-render-to-string","vendor-chunks/lru-cache","vendor-chunks/cookie","vendor-chunks/@auth","vendor-chunks/oidc-token-hash","vendor-chunks/@panva"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Freferral-commissions%2Froute&page=%2Fapi%2Freferral-commissions%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Freferral-commissions%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDownloads%5Cdental-erp-claudecode%5Cdental-erp&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();