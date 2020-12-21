// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

// This must be on top, do not change. Required by webpack.
import '../common/main';
// This must be on top, do not change. Required by webpack.

// tslint:disable-next-line: ordered-imports
import '../common/index.css';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { IVsCodeApi } from '../react-common/postOffice';
import { detectBaseTheme } from '../react-common/themeDetector';
import { StartPage } from './startPage';

// This special function talks to vscode from a web panel
export declare function acquireVsCodeApi(): IVsCodeApi;

const baseTheme = detectBaseTheme();
// tslint:disable-next-line: no-any
const testMode = (window as any).inTestMode;
// tslint:disable-next-line: no-typeof-undefined
const skipDefault = testMode ? false : typeof acquireVsCodeApi !== 'undefined';

ReactDOM.render(
    <StartPage baseTheme={baseTheme} skipDefault={skipDefault} testMode={testMode} />,
    document.getElementById('root') as HTMLElement,
);
