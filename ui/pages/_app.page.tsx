import '../styles/globals.css'

import './reactCOIServiceWorker'

import { PublicKey, PrivateKey, Field } from 'snarkyjs'
import { useEffect, useState } from 'react'
import ZkappWorkerClient from './zkappWorkerClient'

let transactionFee = 0.1

export default function App() {
  let [state, setState] = useState({
    zkappWorkerClient: null as null | ZkappWorkerClient,
    hasWallet: null as null | boolean,
    hasBeenSetup: false,
    accountExists: false,
    currentNum: null as null | Field,
    publicKey: null as null | PublicKey,
    zkappPublicKey: null as null | PublicKey,
    creatingTransaction: false,
  })

  useEffect(() => {
    ;(async () => {
      if (!state.hasBeenSetup) {
        const zkappWorkerClient = new ZkappWorkerClient()

        console.log('Loading SnarkyJS...')

        await zkappWorkerClient.loadSnarkyJS()

        console.log('done')

        await zkappWorkerClient.setActiveInstanceToBerkeley()

        const mina = (window as any).mina

        if (mina == null) {
          setState({ ...state, hasWallet: false })
          return
        }

        const publicKeyBase58: string = (await mina.requestAccounts())[0]
        const publicKey = PublicKey.fromBase58(publicKeyBase58)

        console.log('using key', publicKey.toBase58())

        console.log('checking if account exists...')

        const res = await zkappWorkerClient.fetchAccount({
          publicKey: publicKey!,
        })

        const accountExists = res.error == null

        await zkappWorkerClient.loadContract()

        console.log('compiling zkApp')

        await zkappWorkerClient.compileContract()

        console.log('zkApp compiled')

        const zkappPublicKey = PublicKey.fromBase58(
          'B62qrDe16LotjQhPRMwG12xZ8Yf5ES8ehNzZ25toJV28tE9FmeGq23A'
        )

        await zkappWorkerClient.initZkappInstance(zkappPublicKey)

        console.log('getting zkApp state...')

        await zkappWorkerClient.fetchAccount({ publicKey: zkappPublicKey })
        const currentNum = await zkappWorkerClient.getNum()
        console.log('current state:', currentNum.toString())

        setState({
          ...state,
          zkappWorkerClient,
          hasWallet: true,
          hasBeenSetup: true,
          publicKey,
          zkappPublicKey,
          accountExists,
          currentNum,
        })
      }
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      if (state.hasBeenSetup && !state.accountExists) {
        let interval: NodeJS.Timer
        interval = setInterval(async () => {
          console.log('checking if account exists...')
          const res = await state.zkappWorkerClient!.fetchAccount({
            publicKey: state.publicKey!,
          })
          const accountExists = res.error == null
          if (accountExists) {
            clearInterval(interval)
            setState((prev) => ({ ...prev, accountExists: true }))
          }
        }, 5000)
      }
    })()
  }, [state.hasBeenSetup])

  const onSendTransaction = async () => {
    setState((prev) => ({ ...prev, creatingTransaction: true }))
    console.log('sending a transaction...')

    await state.zkappWorkerClient!.fetchAccount({ publicKey: state.publicKey! })
    await state.zkappWorkerClient!.createUpdateTransaction()

    console.log('creating proof...')

    await state.zkappWorkerClient!.proveUpdateTransaction()

    console.log('getting Transaction JSON...')
    const transactionJSON = await state.zkappWorkerClient!.getTransactionJSON()

    console.log('requesting send transaction...')

    const { hash } = await (window as any).mina.sendTransaction({
      transaction: transactionJSON,
      feePayer: {
        fee: transactionFee,
        memo: '',
      },
    })
    console.log(
      'See transaction at https://berkeley.minaexplorer.com/transaction/' + hash
    )

    setState((prev) => ({ ...prev, creatingTransaction: false }))
  }

  const onRefreshCurrentNum = async () => {
    console.log('getting zkApp state...')
    await state.zkappWorkerClient!.fetchAccount({
      publicKey: state.zkappPublicKey!,
    })
    const currentNum = await state.zkappWorkerClient!.getNum()
    console.log('current state:', currentNum.toString())

    setState((prev) => ({ ...prev, currentNum }))
  }

  let setupText = state.hasBeenSetup
    ? 'SnarkyJS Ready'
    : 'Setting up SnarkyJS...'

  return (
    <div>
      <div>
        {' '}
        {setupText}{' '}
        {!state.hasWallet && (
          <div>
            {' '}
            Could not find a wallet. Install Auro wallet here:{' '}
            <a
              href="https://www.aurowallet.com/"
              target="_blank"
              rel="noreferrer"
            >
              {' '}
              [Link]{' '}
            </a>
          </div>
        )}
      </div>
      {state.hasBeenSetup && !state.accountExists && (
        <div>
          Account does not exist. Please visit the faucet to fund this account
          <a
            href={`https://faucet.minaprotocol.com/?address=${state.publicKey!.toBase58()}`}
            target="_blank"
            rel="noreferrer"
          >
            {' '}
            [Link]{' '}
          </a>
        </div>
      )}

      {state.hasBeenSetup && state.accountExists && (
        <div>
          <button
            onClick={onSendTransaction}
            disabled={state.creatingTransaction}
          >
            {' '}
            Send Transaction{' '}
          </button>
          <div> Current Number in zkApp: {state.currentNum!.toString()} </div>
          <button onClick={onRefreshCurrentNum}> Get Latest State </button>
        </div>
      )}
    </div>
  )
}
