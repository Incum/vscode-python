// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import * as assert from 'assert';
import * as nodeFetch from 'node-fetch';
import * as typemoq from 'typemoq';

import { instance, mock } from 'ts-mockito';
import { IApplicationShell } from '../../client/common/application/types';
import { AsyncDisposableRegistry } from '../../client/common/asyncDisposableRegistry';
import { ConfigurationService } from '../../client/common/configuration/service';
import { MultiStepInputFactory } from '../../client/common/utils/multiStepInput';
import { JupyterPasswordConnect } from '../../client/datascience/jupyter/jupyterPasswordConnect';

// tslint:disable:no-any max-func-body-length
suite('JupyterPasswordConnect', () => {
    let jupyterPasswordConnect: JupyterPasswordConnect;
    let appShell: typemoq.IMock<IApplicationShell>;

    const xsrfValue: string = '12341234';
    const sessionName: string = 'sessionName';
    const sessionValue: string = 'sessionValue';

    setup(() => {
        appShell = typemoq.Mock.ofType<IApplicationShell>();
        appShell.setup((a) => a.showInputBox(typemoq.It.isAny())).returns(() => Promise.resolve('Python'));
        const multiStepFactory = new MultiStepInputFactory(appShell.object);
        const mockDisposableRegistry = mock(AsyncDisposableRegistry);
        const mockConfigSettings = mock(ConfigurationService);

        jupyterPasswordConnect = new JupyterPasswordConnect(
            appShell.object,
            multiStepFactory,
            instance(mockDisposableRegistry),
            instance(mockConfigSettings)
        );
    });

    function createMockSetup(secure: boolean, ok: boolean) {
        // Set up our fake node fetch
        const fetchMock: typemoq.IMock<typeof nodeFetch.default> = typemoq.Mock.ofInstance(nodeFetch.default);

        //tslint:disable-next-line:no-http-string
        const rootUrl = secure ? 'https://TESTNAME:8888/' : 'http://TESTNAME:8888/';

        // Mock our first call to get xsrf cookie
        const mockXsrfResponse = typemoq.Mock.ofType(nodeFetch.Response);
        const mockXsrfHeaders = typemoq.Mock.ofType(nodeFetch.Headers);
        mockXsrfHeaders.setup((mh) => mh.get('set-cookie')).returns(() => `_xsrf=${xsrfValue}`);
        mockXsrfResponse.setup((mr) => mr.ok).returns(() => ok);
        mockXsrfResponse.setup((mr) => mr.status).returns(() => 302);
        mockXsrfResponse.setup((mr) => mr.headers).returns(() => mockXsrfHeaders.object);

        const mockHubResponse = typemoq.Mock.ofType(nodeFetch.Response);
        mockHubResponse.setup((mr) => mr.ok).returns(() => false);
        mockHubResponse.setup((mr) => mr.status).returns(() => 404);

        fetchMock
            .setup((fm) =>
                fm(
                    `${rootUrl}login?`,
                    typemoq.It.isObjectWith({
                        method: 'get',
                        headers: { Connection: 'keep-alive' }
                    })
                )
            )
            .returns(() => Promise.resolve(mockXsrfResponse.object));
        fetchMock
            .setup((fm) =>
                //tslint:disable-next-line:no-http-string
                fm(
                    `${rootUrl}tree?`,
                    typemoq.It.isObjectWith({
                        method: 'get',
                        headers: { Connection: 'keep-alive' }
                    })
                )
            )
            .returns(() => Promise.resolve(mockXsrfResponse.object));
        fetchMock
            .setup((fm) =>
                //tslint:disable-next-line:no-http-string
                fm(
                    `${rootUrl}hub/api`,
                    typemoq.It.isObjectWith({
                        method: 'get',
                        headers: { Connection: 'keep-alive' }
                    })
                )
            )
            .returns(() => Promise.resolve(mockHubResponse.object));

        return { fetchMock, mockXsrfHeaders, mockXsrfResponse };
    }

    test('getPasswordConnectionInfo', async () => {
        const { fetchMock, mockXsrfHeaders, mockXsrfResponse } = createMockSetup(false, true);

        // Mock our second call to get session cookie
        const mockSessionResponse = typemoq.Mock.ofType(nodeFetch.Response);
        const mockSessionHeaders = typemoq.Mock.ofType(nodeFetch.Headers);
        mockSessionHeaders.setup((mh) => mh.get('set-cookie')).returns(() => `${sessionName}=${sessionValue}`);
        mockSessionResponse.setup((mr) => mr.status).returns(() => 302);
        mockSessionResponse.setup((mr) => mr.headers).returns(() => mockSessionHeaders.object);

        // typemoq doesn't love this comparison, so generalize it a bit
        fetchMock
            .setup((fm) =>
                fm(
                    //tslint:disable-next-line:no-http-string
                    'http://TESTNAME:8888/login?',
                    typemoq.It.isObjectWith({
                        method: 'post',
                        headers: {
                            Cookie: `_xsrf=${xsrfValue}`,
                            Connection: 'keep-alive',
                            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
                        }
                    })
                )
            )
            .returns(() => Promise.resolve(mockSessionResponse.object));

        const result = await jupyterPasswordConnect.getPasswordConnectionInfo(
            //tslint:disable-next-line:no-http-string
            'http://TESTNAME:8888/',
            fetchMock.object
        );
        assert(result, 'Failed to get password');
        if (result) {
            // tslint:disable-next-line: no-cookies
            assert.ok((result.requestHeaders as any).cookie, 'No cookie');
        }

        // Verfiy calls
        mockXsrfHeaders.verifyAll();
        mockSessionHeaders.verifyAll();
        mockXsrfResponse.verifyAll();
        mockSessionResponse.verifyAll();
        fetchMock.verifyAll();
    });

    test('getPasswordConnectionInfo allowUnauthorized', async () => {
        const { fetchMock, mockXsrfHeaders, mockXsrfResponse } = createMockSetup(true, true);

        // Mock our second call to get session cookie
        const mockSessionResponse = typemoq.Mock.ofType(nodeFetch.Response);
        const mockSessionHeaders = typemoq.Mock.ofType(nodeFetch.Headers);
        mockSessionHeaders
            .setup((mh) => mh.get('set-cookie'))
            .returns(() => `${sessionName}=${sessionValue}`)
            .verifiable(typemoq.Times.once());
        mockSessionResponse.setup((mr) => mr.status).returns(() => 302);
        mockSessionResponse.setup((mr) => mr.headers).returns(() => mockSessionHeaders.object);

        // typemoq doesn't love this comparison, so generalize it a bit
        //tslint:disable-next-line:no-http-string
        fetchMock
            .setup((fm) =>
                fm(
                    'https://TESTNAME:8888/login?',
                    typemoq.It.isObjectWith({
                        method: 'post',
                        headers: {
                            Cookie: `_xsrf=${xsrfValue}`,
                            Connection: 'keep-alive',
                            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
                        }
                    })
                )
            )
            .returns(() => Promise.resolve(mockSessionResponse.object));

        //tslint:disable-next-line:no-http-string
        const result = await jupyterPasswordConnect.getPasswordConnectionInfo(
            'https://TESTNAME:8888/',
            fetchMock.object
        );
        assert(result, 'Failed to get password');
        if (result) {
            // tslint:disable-next-line: no-cookies
            assert.ok((result.requestHeaders as any).cookie, 'No cookie');
        }

        // Verfiy calls
        mockXsrfHeaders.verifyAll();
        mockSessionHeaders.verifyAll();
        mockXsrfResponse.verifyAll();
        mockSessionResponse.verifyAll();
        fetchMock.verifyAll();
    });

    test('getPasswordConnectionInfo failure', async () => {
        const { fetchMock, mockXsrfHeaders, mockXsrfResponse } = createMockSetup(false, false);

        const result = await jupyterPasswordConnect.getPasswordConnectionInfo(
            //tslint:disable-next-line:no-http-string
            'http://TESTNAME:8888/',
            fetchMock.object
        );
        assert(!result);

        // Verfiy calls
        mockXsrfHeaders.verifyAll();
        mockXsrfResponse.verifyAll();
        fetchMock.verifyAll();
    });
});
