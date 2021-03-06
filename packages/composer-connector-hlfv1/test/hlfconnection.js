/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const BusinessNetworkDefinition = require('composer-common').BusinessNetworkDefinition;
const Chain = require('fabric-client/lib/Chain');
const Client = require('fabric-client');
const EventHub = require('fabric-client/lib/EventHub');
const FabricCAClientImpl = require('fabric-ca-client');
const HLFConnection = require('../lib/hlfconnection');
const HLFConnectionManager = require('../lib/hlfconnectionmanager');
const HLFSecurityContext = require('../lib/hlfsecuritycontext');
const path = require('path');
const semver = require('semver');
const User = require('fabric-client/lib/User.js');
const utils = require('fabric-client/lib/utils.js');

const connectorPackageJSON = require('../package.json');
const originalVersion = connectorPackageJSON.version;

const chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));
const sinon = require('sinon');
require('sinon-as-promised');

const runtimeModulePath = path.dirname(require.resolve('composer-runtime-hlfv1'));

describe('HLFConnection', () => {

    let sandbox;
    let mockConnectionManager, mockChain, mockClient, mockEventHub, mockCAClient, mockUser, mockSecurityContext, mockBusinessNetwork;
    let connectOptions;
    let connection;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
        mockConnectionManager = sinon.createStubInstance(HLFConnectionManager);
        mockChain = sinon.createStubInstance(Chain);
        mockClient = sinon.createStubInstance(Client);
        mockEventHub = sinon.createStubInstance(EventHub);
        mockCAClient = sinon.createStubInstance(FabricCAClientImpl);
        mockUser = sinon.createStubInstance(User);
        mockSecurityContext = sinon.createStubInstance(HLFSecurityContext);
        mockBusinessNetwork = sinon.createStubInstance(BusinessNetworkDefinition);
        mockBusinessNetwork.getName.returns('org.acme.biznet');
        mockBusinessNetwork.toArchive.resolves(Buffer.from('hello world'));
        connectOptions = {
            orderers: [
                'grpc://localhost:7050'
            ],
            peers: [
                'grpc://localhost:7051'
            ],
            events: [
                'grpc://localhost:7053'
            ],
            ca: 'http://localhost:7054',
            keyValStore: '/tmp/hlfabric1',
            channel: 'testchainid'
        };
        connection = new HLFConnection(mockConnectionManager, 'hlfabric1', 'org.acme.biznet', connectOptions, mockClient, mockChain, mockEventHub, mockCAClient);
    });

    afterEach(() => {
        sandbox.restore();
        connectorPackageJSON.version = originalVersion;
    });

    describe('#createUser', () => {

        it('should create a new user', () => {
            let user = HLFConnection.createUser('admin', mockClient);
            user.should.be.an.instanceOf(User);
        });

    });

    describe('#constructor', () => {

        it('should throw if connectOptions not specified', () => {
            (() => {
                new HLFConnection(mockConnectionManager, 'hlfabric1', 'org.acme.biznet', null, mockClient, mockChain, mockEventHub, mockCAClient);
            }).should.throw(/connectOptions not specified/);
        });

        it('should throw if client not specified', () => {
            (() => {
                new HLFConnection(mockConnectionManager, 'hlfabric1', 'org.acme.biznet', { type: 'hlfv1' }, null, mockChain, mockEventHub, mockCAClient);
            }).should.throw(/client not specified/);
        });

        it('should throw if chain not specified', () => {
            (() => {
                new HLFConnection(mockConnectionManager, 'hlfabric1', 'org.acme.biznet', { type: 'hlfv1' }, mockClient, null, mockEventHub, mockCAClient);
            }).should.throw(/chain not specified/);
        });

        it('should throw if eventHub not specified', () => {
            (() => {
                new HLFConnection(mockConnectionManager, 'hlfabric1', 'org.acme.biznet', { type: 'hlfv1' }, mockClient, mockChain, null, mockCAClient);
            }).should.throw(/eventHub not specified/);
        });

        it('should throw if caClient not specified', () => {
            (() => {
                new HLFConnection(mockConnectionManager, 'hlfabric1', 'org.acme.biznet', { type: 'hlfv1' }, mockClient, mockChain, mockEventHub, null);
            }).should.throw(/caClient not specified/);
        });

    });

    describe('#getConnectionOptions', () => {

        it('should return the connection options', () => {
            connection.getConnectionOptions().should.deep.equal(connectOptions);
        });

    });

    describe('#disconnect', () => {

        it('should disconnect from the event hub if connected', () => {
            mockEventHub.isconnected.returns(true);
            return connection.disconnect()
                .then(() => {
                    sinon.assert.calledOnce(mockEventHub.disconnect);
                });
        });

        it('should not disconnect from the event hub if not connected', () => {
            mockEventHub.isconnected.returns(false);
            return connection.disconnect()
                .then(() => {
                    sinon.assert.notCalled(mockEventHub.disconnect);
                });
        });

        it('should handle an error disconnecting from the event hub', () => {
            mockEventHub.isconnected.throws(new Error('such error'));
            return connection.disconnect()
                .should.be.rejectedWith(/such error/);
        });

    });

    describe('#enroll', () => {

        beforeEach(() => {
            sandbox.stub(HLFConnection, 'createUser').returns(mockUser);
        });

        it('should throw if enrollmentID not specified', () => {
            (() => {
                connection.enroll(null, 'adminpw');
            }).should.throw(/enrollmentID not specified/);
        });

        it('should throw if enrollmentSecret not specified', () => {
            (() => {
                connection.enroll('admin', null);
            }).should.throw(/enrollmentSecret not specified/);
        });

        it('should enroll and store the user context using the CA client', () => {
            mockCAClient.enroll.withArgs({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' }).resolves({
                key: 'suchkey',
                certificate: 'suchcert'
            });
            return connection.enroll('admin', 'adminpw')
                .then(() => {
                    sinon.assert.calledOnce(mockUser.setEnrollment);
                    sinon.assert.calledWith(mockUser.setEnrollment, 'suchkey', 'suchcert');
                    sinon.assert.calledOnce(mockClient.setUserContext);
                    sinon.assert.calledWith(mockClient.setUserContext, mockUser);
                });
        });

        it('should handle an error from enrollment', () => {
            mockCAClient.enroll.withArgs({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' }).rejects('such error');
            return connection.enroll('admin', 'adminpw')
                .should.be.rejectedWith(/such error/);
        });

    });

    describe('#login', () => {

        it('should throw if enrollmentID not specified', () => {
            (() => {
                connection.login(null, 'adminpw');
            }).should.throw(/enrollmentID not specified/);
        });

        it('should throw if enrollmentSecret not specified', () => {
            (() => {
                connection.login('admin', null);
            }).should.throw(/enrollmentSecret not specified/);
        });

        it('should load an already enrolled user from the state store', () => {
            mockClient.getUserContext.withArgs('admin').resolves(mockUser);
            mockUser.isEnrolled.returns(true);
            return connection.login('admin', 'adminpw')
                .then((securityContext) => {
                    securityContext.should.be.an.instanceOf(HLFSecurityContext);
                    securityContext.getUser().should.equal('admin');
                });
        });

        it('should enroll a user if not already enrolled', () => {
            mockClient.getUserContext.withArgs('admin').resolves(null);
            sandbox.stub(connection, 'enroll').withArgs('admin', 'adminpw').resolves(mockUser);
            return connection.login('admin', 'adminpw')
                .then((securityContext) => {
                    securityContext.should.be.an.instanceOf(HLFSecurityContext);
                    securityContext.getUser().should.equal('admin');
                });
        });

        it('should handle an error from the client', () => {
            mockClient.getUserContext.withArgs('admin').rejects('such error');
            return connection.login('admin', 'adminpw')
                .should.be.rejectedWith(/such error/);
        });

    });

    describe('#deploy', () => {

        const tempDirectoryPath = path.resolve('tmp', 'composer1234567890');
        const targetDirectoryPath = path.resolve(tempDirectoryPath, 'src', 'composer');
        const versionFilePath = path.resolve(targetDirectoryPath, 'version.go');
        const certificateFilePath = path.resolve(targetDirectoryPath, 'certificate.pem');

        beforeEach(() => {
            sandbox.stub(connection.temp, 'mkdir').withArgs('composer').resolves(tempDirectoryPath);
            sandbox.stub(connection.fs, 'copy').resolves();
            sandbox.stub(connection.fs, 'outputFile').resolves();
        });

        it('should throw if businessNetwork not specified', () => {
            (() => {
                connection.deploy(mockSecurityContext, false, null);
            }).should.throw(/businessNetwork not specified/);
        });

        it('should deploy the business network', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the deployment proposal and response (from the peers).
            const proposalResponses = [{
                response: {
                    status: 200
                }
            }];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            mockChain.sendInstallProposal.resolves([ proposalResponses, proposal, header ]);
            mockChain.sendInstantiateProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'SUCCESS'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            mockEventHub.registerTxEvent.yields();
            return connection.deploy(mockSecurityContext, false, mockBusinessNetwork)
                .then(() => {
                    sinon.assert.calledOnce(connection.fs.copy);
                    sinon.assert.calledWith(connection.fs.copy, runtimeModulePath, targetDirectoryPath, sinon.match.object);
                    // Check the filter ignores any relevant node modules files.
                    connection.fs.copy.firstCall.args[2].filter('some/path/here').should.be.true;
                    connection.fs.copy.firstCall.args[2].filter('some/node_modules/here').should.be.true;
                    connection.fs.copy.firstCall.args[2].filter('composer-runtime-hlfv1/node_modules/here').should.be.false;
                    sinon.assert.calledOnce(connection.fs.outputFile);
                    sinon.assert.calledWith(connection.fs.outputFile, versionFilePath, sinon.match(/const version = /));
                    sinon.assert.calledOnce(mockChain.sendInstallProposal);
                    sinon.assert.calledOnce(mockChain.sendInstantiateProposal);
                    sinon.assert.calledWith(mockChain.sendInstallProposal, {
                        chaincodePath: 'composer',
                        chaincodeVersion: '1.0',
                        chaincodeId: 'org.acme.biznet',
                        chainId: connectOptions.channel,
                        txId: '00000000-0000-0000-0000-000000000000',
                        nonce: '11111111-1111-1111-1111-111111111111',
                    });
                    sinon.assert.calledWith(mockChain.sendInstantiateProposal, {
                        chaincodePath: 'composer',
                        chaincodeVersion: '1.0',
                        chaincodeId: 'org.acme.biznet',
                        chainId: connectOptions.channel,
                        txId: '00000000-0000-0000-0000-000000000000',
                        nonce: '11111111-1111-1111-1111-111111111111',
                        fcn: 'init',
                        args: ['aGVsbG8gd29ybGQ=']
                    });

                    sinon.assert.calledOnce(mockChain.sendTransaction);
                });
        });

        it('should add the certificate into the deployment package', () => {
            // Add the certificate into the connect options.
            connection.connectOptions = { type: 'hlfv1', certificate: 'such cert' };
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the deployment proposal and response (from the peers).
            const proposalResponses = [{
                response: {
                    status: 200
                }
            }];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            mockChain.sendInstallProposal.resolves([ proposalResponses, proposal, header ]);
            mockChain.sendInstantiateProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'SUCCESS'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            mockEventHub.registerTxEvent.yields();
            return connection.deploy(mockSecurityContext, false, mockBusinessNetwork)
                .then(() => {
                    sinon.assert.calledTwice(connection.fs.outputFile);
                    sinon.assert.calledWith(connection.fs.outputFile, certificateFilePath, sinon.match(/such cert/));
                });
        });

        it('should throw if no endorsement responses are returned', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the deployment proposal and response (from the peers).
            const proposalResponses = [];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            mockChain.sendInstallProposal.resolves([ proposalResponses, proposal, header ]);
            mockChain.sendInstantiateProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'SUCCESS'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            mockEventHub.registerTxEvent.yields();
            return connection.deploy(mockSecurityContext, false, mockBusinessNetwork)
                .should.be.rejectedWith(/No results were returned/);
        });

        it('should throw any endorsement responses that are errors', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the deployment proposal and response (from the peers).
            const proposalResponses = [ new Error('such error') ];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            mockChain.sendInstallProposal.resolves([ proposalResponses, proposal, header ]);
            mockChain.sendInstantiateProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'SUCCESS'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            mockEventHub.registerTxEvent.yields();
            return connection.deploy(mockSecurityContext, false, mockBusinessNetwork)
                .should.be.rejectedWith(/such error/);
        });

        it('should throw any endorsement responses that have a non-200 status code', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the deployment proposal and response (from the peers).
            const proposalResponses = [{
                response: {
                    status: 500,
                    payload: 'such error'
                }
            }];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            mockChain.sendInstallProposal.resolves([ proposalResponses, proposal, header ]);
            mockChain.sendInstantiateProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'SUCCESS'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            mockEventHub.registerTxEvent.yields();
            return connection.deploy(mockSecurityContext, false, mockBusinessNetwork)
                .should.be.rejectedWith(/such error/);
        });

        it('should throw an error if the commit of the transaction times out', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the deployment proposal and response (from the peers).
            const proposalResponses = [{
                response: {
                    status: 200
                }
            }];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            mockChain.sendInstallProposal.resolves([ proposalResponses, proposal, header ]);
            mockChain.sendInstantiateProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'SUCCESS'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            sandbox.stub(global, 'setTimeout').yields();
            // mockEventHub.registerTxEvent.yields();
            return connection.deploy(mockSecurityContext, false, mockBusinessNetwork)
                .should.be.rejectedWith(/Failed to receive commit notification/);
        });

        it('should throw an error if the commit throws an error', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the deployment proposal and response (from the peers).
            const proposalResponses = [{
                response: {
                    status: 200
                }
            }];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            mockChain.sendInstallProposal.resolves([ proposalResponses, proposal, header ]);
            mockChain.sendInstantiateProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'FAILURE'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            mockEventHub.registerTxEvent.yields();
            return connection.deploy(mockSecurityContext, false, mockBusinessNetwork)
                .should.be.rejectedWith(/Failed to commit transaction/);
        });

    });

    describe('#undeploy', () => {

        it('should throw if businessNetworkIdentifier not specified', () => {
            (() => {
                connection.undeploy(mockSecurityContext, null);
            }).should.throw(/businessNetworkIdentifier not specified/);
        });

        it('should invoke the chaincode', () => {
            sandbox.stub(connection, 'invokeChainCode').resolves();
            return connection.undeploy(mockSecurityContext, 'org.acme.biznet')
                .then(() => {
                    sinon.assert.calledOnce(connection.invokeChainCode);
                    sinon.assert.calledWith(connection.invokeChainCode, mockSecurityContext, 'undeploy', ['org.acme.biznet']);
                });
        });

        it('should handle errors invoking the chaincode', () => {
            sandbox.stub(connection, 'invokeChainCode').rejects('such error');
            return connection.undeploy(mockSecurityContext, 'org.acme.biznet')
                .should.be.rejectedWith(/such error/);
        });

    });

    describe('#update', () => {

        it('should throw if businessNetworkDefinition not specified', () => {
            (() => {
                connection.update(mockSecurityContext, null);
            }).should.throw(/businessNetworkDefinition not specified/);
        });

        it('should invoke the chaincode', () => {
            sandbox.stub(connection, 'invokeChainCode').resolves();
            return connection.update(mockSecurityContext, mockBusinessNetwork)
                .then(() => {
                    sinon.assert.calledOnce(connection.invokeChainCode);
                    sinon.assert.calledWith(connection.invokeChainCode, mockSecurityContext, 'updateBusinessNetwork', ['aGVsbG8gd29ybGQ=']);
                });
        });

        it('should handle errors invoking the chaincode', () => {
            sandbox.stub(connection, 'invokeChainCode').rejects('such error');
            return connection.update(mockSecurityContext, mockBusinessNetwork)
                .should.be.rejectedWith(/such error/);
        });

    });

    describe('#ping', () => {

        it('should handle a chaincode with the same version as the connector', () => {
            const response = {
                version: connectorPackageJSON.version,
                participant: 'org.acme.biznet.Person#SSTONE1@uk.ibm.com'
            };
            sandbox.stub(connection, 'queryChainCode').resolves(Buffer.from(JSON.stringify(response)));
            return connection.ping(mockSecurityContext)
                .then((result) => {
                    sinon.assert.calledOnce(connection.queryChainCode);
                    sinon.assert.calledWith(connection.queryChainCode, mockSecurityContext, 'ping', []);
                    result.should.deep.equal(response);
                });
        });

        it('should handle a chaincode with a lower version than the connector', () => {
            const oldVersion = connectorPackageJSON.version;
            connectorPackageJSON.version = semver.inc(oldVersion, 'patch');
            const response = {
                version: oldVersion,
                participant: 'org.acme.biznet.Person#SSTONE1@uk.ibm.com'
            };
            sandbox.stub(connection, 'queryChainCode').resolves(Buffer.from(JSON.stringify(response)));
            return connection.ping(mockSecurityContext)
                .then((result) => {
                    sinon.assert.calledOnce(connection.queryChainCode);
                    sinon.assert.calledWith(connection.queryChainCode, mockSecurityContext, 'ping', []);
                    result.should.deep.equal(response);
                });
        });

        it('should throw for a chaincode with a greater version than the connector', () => {
            const version = connectorPackageJSON.version;
            const newVersion = semver.inc(version, 'major');
            const response = {
                version: newVersion,
                participant: 'org.acme.biznet.Person#SSTONE1@uk.ibm.com'
            };
            sandbox.stub(connection, 'queryChainCode').resolves(Buffer.from(JSON.stringify(response)));
            return connection.ping(mockSecurityContext)
                .should.be.rejectedWith(/is incompatible with/);
        });

        it('should handle a chaincode running a prelease build at the same version as the connector', () => {
            connectorPackageJSON.version += '-20170101';
            const response = {
                version: connectorPackageJSON.version,
                participant: 'org.acme.biznet.Person#SSTONE1@uk.ibm.com'
            };
            sandbox.stub(connection, 'queryChainCode').resolves(Buffer.from(JSON.stringify(response)));
            return connection.ping(mockSecurityContext)
                .then((result) => {
                    sinon.assert.calledOnce(connection.queryChainCode);
                    sinon.assert.calledWith(connection.queryChainCode, mockSecurityContext, 'ping', []);
                    result.should.deep.equal(response);
                });
        });

        it('should handle a chaincode running a prelease build at the same version as the connector', () => {
            connectorPackageJSON.version += '-20170101';
            const response = {
                version: connectorPackageJSON.version,
                participant: 'org.acme.biznet.Person#SSTONE1@uk.ibm.com'
            };
            sandbox.stub(connection, 'queryChainCode').resolves(Buffer.from(JSON.stringify(response)));
            return connection.ping(mockSecurityContext)
                .then((result) => {
                    sinon.assert.calledOnce(connection.queryChainCode);
                    sinon.assert.calledWith(connection.queryChainCode, mockSecurityContext, 'ping', []);
                    result.should.deep.equal(response);
                });
        });

        it('should throw for a chaincode running a prelease build at a different version to the connector', () => {
            const oldVersion = connectorPackageJSON.version;
            connectorPackageJSON.version += '-20170101';
            const response = {
                version: oldVersion + '-20170202',
                participant: 'org.acme.biznet.Person#SSTONE1@uk.ibm.com'
            };
            sandbox.stub(connection, 'queryChainCode').resolves(Buffer.from(JSON.stringify(response)));
            return connection.ping(mockSecurityContext)
                .should.be.rejectedWith(/is incompatible with/);
        });

        it('should handle errors invoking the chaincode', () => {
            sandbox.stub(connection, 'queryChainCode').rejects('such error');
            return connection.ping(mockSecurityContext)
                .should.be.rejectedWith(/such error/);
        });

    });

    describe('#queryChainCode', () => {

        it('should throw if functionName not specified', () => {
            (() => {
                connection.queryChainCode(mockSecurityContext, null, []);
            }).should.throw(/functionName not specified/);
        });

        it('should throw if args not specified', () => {
            (() => {
                connection.queryChainCode(mockSecurityContext, 'myfunc', null);
            }).should.throw(/args not specified/);
        });

        it('should throw if args contains non-string values', () => {
            (() => {
                connection.queryChainCode(mockSecurityContext, 'myfunc', [3.142]);
            }).should.throw(/invalid arg specified: 3.142/);
        });

        it('should submit a query request to the chaincode', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            // This is the response from the chaincode.
            const response = Buffer.from('hello world');
            mockChain.queryByChaincode.resolves([response]);
            return connection.queryChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .then((result) => {
                    sinon.assert.calledOnce(mockChain.queryByChaincode);
                    sinon.assert.calledWith(mockChain.queryByChaincode, {
                        chaincodeId: 'org.acme.biznet',
                        chainId: 'testchainid',
                        txId: '00000000-0000-0000-0000-000000000000',
                        nonce: '11111111-1111-1111-1111-111111111111',
                        fcn: 'myfunc',
                        args: ['arg1', 'arg2'],
                        attrs: ['userID']
                    });
                    result.equals(response).should.be.true;
                });
        });

        it('should throw if no responses are returned', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            // This is the response from the chaincode.
            mockChain.queryByChaincode.resolves([]);
            return connection.queryChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .should.be.rejectedWith(/No payloads were returned from the query request/);
        });

    });

    describe('#invokeChainCode', () => {

        it('should throw if functionName not specified', () => {
            (() => {
                connection.invokeChainCode(mockSecurityContext, null, []);
            }).should.throw(/functionName not specified/);
        });

        it('should throw if args not specified', () => {
            (() => {
                connection.invokeChainCode(mockSecurityContext, 'myfunc', null);
            }).should.throw(/args not specified/);
        });

        it('should throw if args contains non-string values', () => {
            (() => {
                connection.invokeChainCode(mockSecurityContext, 'myfunc', [3.142]);
            }).should.throw(/invalid arg specified: 3.142/);
        });

        it('should submit an invoke request to the chaincode', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            // This is the transaction proposal and response (from the peers).
            const proposalResponses = [{
                response: {
                    status: 200
                }
            }];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            mockChain.sendTransactionProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'SUCCESS'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            mockEventHub.registerTxEvent.yields();
            return connection.invokeChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .then((result) => {
                    sinon.assert.calledOnce(mockChain.sendTransactionProposal);
                    sinon.assert.calledWith(mockChain.sendTransactionProposal, {
                        chaincodeId: 'org.acme.biznet',
                        chainId: 'testchainid',
                        txId: '00000000-0000-0000-0000-000000000000',
                        nonce: '11111111-1111-1111-1111-111111111111',
                        fcn: 'myfunc',
                        args: ['arg1', 'arg2'],
                        attrs: ['userID']
                    });
                    sinon.assert.calledOnce(mockChain.sendTransaction);
                });
        });

        it('should throw if no endorsement responses are returned', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            // This is the transaction proposal and response (from the peers).
            const proposalResponses = [];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            mockChain.sendTransactionProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'SUCCESS'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            mockEventHub.registerTxEvent.yields();
            return connection.invokeChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .should.be.rejectedWith(/No results were returned/);
        });

        it('should throw any endorsement responses that are errors', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            // This is the transaction proposal and response (from the peers).
            const proposalResponses = [ new Error('such error') ];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            mockChain.sendTransactionProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'SUCCESS'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            mockEventHub.registerTxEvent.yields();
            return connection.invokeChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .should.be.rejectedWith(/such error/);
        });

        it('should throw any endorsement responses that have a non-200 status code', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            // This is the transaction proposal and response (from the peers).
            const proposalResponses = [{
                response: {
                    status: 500,
                    payload: 'such error'
                }
            }];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            mockChain.sendTransactionProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'SUCCESS'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            mockEventHub.registerTxEvent.yields();
            return connection.invokeChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .should.be.rejectedWith(/such error/);
        });

        it('should throw an error if the commit of the transaction times out', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            // This is the transaction proposal and response (from the peers).
            const proposalResponses = [{
                response: {
                    status: 200
                }
            }];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            mockChain.sendTransactionProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'SUCCESS'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            sandbox.stub(global, 'setTimeout').yields();
            // mockEventHub.registerTxEvent.yields();
            return connection.invokeChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .should.be.rejectedWith(/Failed to receive commit notification/);
        });

        it('should throw an error if the commit throws an error', () => {
            // This is the generated nonce.
            sandbox.stub(utils, 'getNonce').returns('11111111-1111-1111-1111-111111111111');
            // This is the generated transaction
            mockChain.buildTransactionID_getUserContext.resolves('00000000-0000-0000-0000-000000000000');
            // This is the transaction proposal and response (from the peers).
            const proposalResponses = [{
                response: {
                    status: 200
                }
            }];
            const proposal = { proposal: 'i do' };
            const header = { header: 'gooooal' };
            mockChain.sendTransactionProposal.resolves([ proposalResponses, proposal, header ]);
            // This is the commit proposal and response (from the orderer).
            const response = {
                status: 'FAILURE'
            };
            mockChain.sendTransaction.withArgs({ proposalResponses: proposalResponses, proposal: proposal, header: header }).resolves(response);
            // This is the event hub response.
            mockEventHub.registerTxEvent.yields();
            return connection.invokeChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .should.be.rejectedWith(/Failed to commit transaction/);
        });

    });

    describe('#createIdentity', () => {

        it('should throw an error as not implemented yet', () => {
            return connection.createIdentity(mockSecurityContext, 'doge')
                .should.be.rejectedWith(/unimplemented function called/);
        });

    });

    describe('#list', () => {

        it('should throw an error as not implemented yet', () => {
            return connection.list(mockSecurityContext)
                .should.be.rejectedWith(/unimplemented function called/);
        });

    });

});
