// src/components/Home.tsx
import { useWallet } from '@txnlab/use-wallet'
import React, { useState } from 'react'
import ConnectWallet from './components/ConnectWallet'
import Transact from './components/Transact'
import {
  claimTokens,
  takeOutAsset_BROKEN,
  getStakingData,
  getUserData,
  getUsersStakeData,
  initStaking,
  stakeTokens,
  unstakeTokens,
} from './staking_func'

interface HomeProps {}

const Home: React.FC<HomeProps> = () => {
  const [openWalletModal, setOpenWalletModal] = useState<boolean>(false)
  const [openDemoModal, setOpenDemoModal] = useState<boolean>(false)
  const [appCallsDemoModal, setAppCallsDemoModal] = useState<boolean>(false)
  const { activeAddress, signer } = useWallet()
  console.log(activeAddress)

  const toggleWalletModal = () => {
    setOpenWalletModal(!openWalletModal)
  }

  const toggleDemoModal = () => {
    setOpenDemoModal(!openDemoModal)
  }

  const toggleAppCallsModal = () => {
    setAppCallsDemoModal(!appCallsDemoModal)
  }
  const FRY_TOKEN_ID: number = 717187263 //Testnet
  const stakingID: number = 731920708
  const deployStaking = async () => {
    try {
      const staking = await initStaking(
        FRY_TOKEN_ID,
        FRY_TOKEN_ID,
        1000000000,
        15552000,
        Math.floor(Date.now() / 1000),
        0,
        activeAddress!,
        signer,
      )
      console.log(staking)
      console.log(staking)
    } catch (e) {
      console.log(e)
    }
  }

  const stake = async () => {
    try {
      const staking = await stakeTokens(stakingID, 1000 * 1000000, activeAddress!, signer, 1000000, 2485314946, '')
      console.log(staking)
    } catch (e) {
      console.log(e)
    }
  }

  const unstake = async () => {
    try {
      const staking = await unstakeTokens(stakingID, 1000 * 1000000, activeAddress!, signer, 1000000, 2485314946, '')
      console.log(staking)
    } catch (e) {
      console.log(e)
    }
  }

  const claim = async () => {
    try {
      const staking = await claimTokens(stakingID, activeAddress!, signer, 1000000, 2485314946, '')
      console.log(staking)
    } catch (e) {
      console.log(e)
    }
  }

  const getStakersData = async () => {
    let data = await getUsersStakeData(stakingID)
    console.log(data)
  }

  const getStaker = async () => {
    let data = await getUserData(stakingID, activeAddress!)
    console.log(data)
  }

  const getStakePoolData = async () => {
    let data = await getStakingData(stakingID, activeAddress!, signer)
    console.log(data)
  }
  const getCalcApr = async () => {
    let data = await takeOutAsset_BROKEN(stakingID, activeAddress!, signer)
    console.log(data)
  }

  return (
    <div className="hero min-h-screen bg-teal-400">
      <div className="hero-content text-center rounded-lg p-6 max-w-md bg-white mx-auto">
        <div className="max-w-md">
          <h1 className="text-4xl">
            Welcome to <div className="font-bold">AlgoKit 🙂</div>
          </h1>
          <p className="py-6">
            This starter has been generated using official AlgoKit React template. Refer to the resource below for next steps.
          </p>

          <div className="grid">
            {/* <a
              data-test-id="getting-started"
              className="btn btn-primary m-2"
              target="_blank"
              href="https://github.com/algorandfoundation/algokit-cli"
            >
              Getting started
            </a> */}

            <div className="divider" />
            <button
              data-test-id="connect-wallet"
              className="btn m-2 flex justify-center button btn-primary mt-[13px]"
              onClick={toggleWalletModal}
            >
              Wallet Connection
            </button>

            {/* {activeAddress && (
              <button data-test-id="transactions-demo" className="btn m-2" onClick={toggleDemoModal}>
                Transactions Demo
              </button>
            )} */}

            {activeAddress && (
              <button
                data-test-id="appcalls-demo"
                className="btn m-2 flex justify-center button btn-primary mt-[13px]"
                onClick={deployStaking}
              >
                Deploy Staking
              </button>
            )}

            {activeAddress && (
              <button data-test-id="appcalls-demo" className="btn m-2 flex justify-center button btn-primary mt-[13px]" onClick={stake}>
                Stake Tokens
              </button>
            )}

            {activeAddress && (
              <button data-test-id="appcalls-demo" className="btn m-2 flex justify-center button btn-primary mt-[13px]" onClick={unstake}>
                Unstake Tokens
              </button>
            )}

            {activeAddress && (
              <button data-test-id="appcalls-demo" className="btn m-2 flex justify-center button btn-primary mt-[13px]" onClick={claim}>
                Claim Tokens
              </button>
            )}

            {activeAddress && (
              <button
                data-test-id="appcalls-demo"
                className="btn m-2 flex justify-center button btn-primary mt-[13px]"
                onClick={getStakePoolData}
              >
                Get Pool Data
              </button>
            )}

            {activeAddress && (
              <button
                data-test-id="appcalls-demo"
                className="btn m-2 flex justify-center button btn-primary mt-[13px]"
                onClick={getStakersData}
              >
                Get Users Data
              </button>
            )}

            {activeAddress && (
              <button data-test-id="appcalls-demo" className="btn m-2 flex justify-center button btn-primary mt-[13px]" onClick={getStaker}>
                Get User Data
              </button>
            )}

            {activeAddress && (
              <button
                data-test-id="appcalls-demo"
                className="btn m-2 flex justify-center button btn-primary mt-[13px]"
                onClick={getCalcApr}
              >
                Get APR
              </button>
            )}
          </div>

          <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
          <Transact openModal={openDemoModal} setModalState={setOpenDemoModal} />
          {/* <AppCalls openModal={appCallsDemoModal} setModalState={setAppCallsDemoModal} /> */}
        </div>
      </div>
    </div>
  )
}

export default Home
