import * as assert from 'assert';
import * as path from 'path';
import { CancellationTokenSource, ConfigurationTarget, Uri, workspace } from 'vscode';
import { LanguageServerType } from '../../client/activation/types';
import { PythonSettings } from '../../client/common/configSettings';
import { LinterProductPathService, TestFrameworkProductPathService } from '../../client/common/installer/productPath';
import { ProductService } from '../../client/common/installer/productService';
import { IProductPathService, IProductService } from '../../client/common/installer/types';
import { IConfigurationService, Product, ProductType } from '../../client/common/types';
import { OSType } from '../../client/common/utils/platform';
import { PythonPathUpdaterService } from '../../client/interpreter/configuration/pythonPathUpdaterService';
import { PythonPathUpdaterServiceFactory } from '../../client/interpreter/configuration/pythonPathUpdaterServiceFactory';
import {
    IPythonPathUpdaterServiceManager,
    IPythonPathUpdaterServiceFactory,
} from '../../client/interpreter/configuration/types';
import { IActivatedEnvironmentLaunch } from '../../client/interpreter/contracts';
import { ActivatedEnvironmentLaunch } from '../../client/interpreter/virtualEnvs/activatedEnvLaunch';
import { ILinter, ILinterManager } from '../../client/linters/types';
import { isOs } from '../common';
import { TEST_TIMEOUT } from '../constants';
import { closeActiveWindows, initialize, initializeTest, IS_MULTI_ROOT_TEST } from '../initialize';
import { UnitTestIocContainer } from '../testing/serviceRegistry';

const multirootPath = path.join(__dirname, '..', '..', '..', 'src', 'testMultiRootWkspc');

suite('Multiroot Linting', () => {
    const pylintSetting = 'linting.pylintEnabled';
    const flake8Setting = 'linting.flake8Enabled';

    let ioc: UnitTestIocContainer;
    suiteSetup(async function () {
        if (!IS_MULTI_ROOT_TEST) {
            this.skip();
        }
        await initialize();
        await initializeDI();
        await initializeTest();
    });
    suiteTeardown(async () => {
        await ioc?.dispose();
        await closeActiveWindows();
        PythonSettings.dispose();
    });
    teardown(async () => {
        await closeActiveWindows();
    });

    async function initializeDI() {
        ioc = new UnitTestIocContainer();
        ioc.registerCommonTypes(false);
        ioc.registerProcessTypes();
        ioc.registerLinterTypes();
        ioc.registerVariableTypes();
        ioc.registerFileSystemTypes();
        await ioc.registerMockInterpreterTypes();
        ioc.serviceManager.addSingleton<IActivatedEnvironmentLaunch>(
            IActivatedEnvironmentLaunch,
            ActivatedEnvironmentLaunch,
        );
        ioc.serviceManager.addSingleton<IPythonPathUpdaterServiceManager>(
            IPythonPathUpdaterServiceManager,
            PythonPathUpdaterService,
        );
        ioc.serviceManager.addSingleton<IPythonPathUpdaterServiceFactory>(
            IPythonPathUpdaterServiceFactory,
            PythonPathUpdaterServiceFactory,
        );
        ioc.registerInterpreterStorageTypes();
        ioc.serviceManager.addSingletonInstance<IProductService>(IProductService, new ProductService());
        ioc.serviceManager.addSingleton<IProductPathService>(
            IProductPathService,
            LinterProductPathService,
            ProductType.Linter,
        );
        ioc.serviceManager.addSingleton<IProductPathService>(
            IProductPathService,
            TestFrameworkProductPathService,
            ProductType.TestFramework,
        );
    }

    async function createLinter(product: Product): Promise<ILinter> {
        const lm = ioc.serviceContainer.get<ILinterManager>(ILinterManager);
        return lm.createLinter(product, ioc.serviceContainer);
    }
    async function testLinterInWorkspaceFolder(
        product: Product,
        workspaceFolderRelativePath: string,
        mustHaveErrors: boolean,
    ): Promise<void> {
        const fileToLint = path.join(multirootPath, workspaceFolderRelativePath, 'file.py');
        const cancelToken = new CancellationTokenSource();
        const document = await workspace.openTextDocument(fileToLint);

        const linter = await createLinter(product);
        const messages = await linter.lint(document, cancelToken.token);

        const errorMessage = mustHaveErrors ? 'No errors returned by linter' : 'Errors returned by linter';
        assert.strictEqual(messages.length > 0, mustHaveErrors, errorMessage);
    }

    test('Enabling Pylint in root and also in Workspace, should return errors', async function () {
        // Timing out on Windows, tracked by #18337.
        if (isOs(OSType.Windows)) {
            return this.skip();
        }

        await runTest(Product.pylint, true, true, pylintSetting);

        return undefined;
    }).timeout(TEST_TIMEOUT * 2);
    test('Enabling Pylint in root and disabling in Workspace, should not return errors', async () => {
        await runTest(Product.pylint, true, false, pylintSetting);
    }).timeout(TEST_TIMEOUT * 2);
    test('Disabling Pylint in root and enabling in Workspace, should return errors', async function () {
        // Timing out on Windows, tracked by #18337.
        if (isOs(OSType.Windows)) {
            return this.skip();
        }

        await runTest(Product.pylint, false, true, pylintSetting);

        return undefined;
    }).timeout(TEST_TIMEOUT * 2);

    test('Enabling Flake8 in root and also in Workspace, should return errors', async function () {
        // Timing out on Windows, tracked by #18337.
        if (isOs(OSType.Windows)) {
            return this.skip();
        }

        await runTest(Product.flake8, true, true, flake8Setting);

        return undefined;
    }).timeout(TEST_TIMEOUT * 2);
    test('Enabling Flake8 in root and disabling in Workspace, should not return errors', async () => {
        await runTest(Product.flake8, true, false, flake8Setting);
    }).timeout(TEST_TIMEOUT * 2);
    test('Disabling Flake8 in root and enabling in Workspace, should return errors', async function () {
        // Timing out on Windows, tracked by #18337.
        if (isOs(OSType.Windows)) {
            return this.skip();
        }

        await runTest(Product.flake8, false, true, flake8Setting);

        return undefined;
    }).timeout(TEST_TIMEOUT * 2);

    async function runTest(product: Product, global: boolean, wks: boolean, setting: string): Promise<void> {
        const config = ioc.serviceContainer.get<IConfigurationService>(IConfigurationService);
        await config.updateSetting(
            'languageServer',
            LanguageServerType.Jedi,
            Uri.file(multirootPath),
            ConfigurationTarget.Global,
        );
        await Promise.all([
            config.updateSetting(setting, global, Uri.file(multirootPath), ConfigurationTarget.Global),
            config.updateSetting(setting, wks, Uri.file(multirootPath), ConfigurationTarget.Workspace),
        ]);
        await testLinterInWorkspaceFolder(product, 'workspace1', wks);
        await Promise.all(
            [ConfigurationTarget.Global, ConfigurationTarget.Workspace].map((configTarget) =>
                config.updateSetting(setting, undefined, Uri.file(multirootPath), configTarget),
            ),
        );
    }
});
