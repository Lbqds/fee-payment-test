import { web3, Project, HexString, Address, ALPH_TOKEN_ID, ONE_ALPH, DUST_AMOUNT, subContractId } from '@alephium/web3'
import { getSigner, testNodeWallet } from '@alephium/web3-test'
import { FeePaymentTest, Certificate, FeePaymentTestInstance, RequestCertificate } from '../artifacts/ts'

describe('integration tests', () => {
  beforeAll(async () => {
    web3.setCurrentNodeProvider('http://127.0.0.1:22973')
    await Project.build()
  })

  async function tokenBalanceOf(address: Address, tokenId: HexString): Promise<bigint> {
    const nodeProvider = web3.getCurrentNodeProvider()
    const balances = await nodeProvider.addresses.getAddressesAddressBalance(address)
    if (tokenId === ALPH_TOKEN_ID) return BigInt(balances.balance)
    return BigInt(balances.tokenBalances?.find((t) => t.id === tokenId)?.amount ?? '0')
  }

  async function deployFeePaymentTest(): Promise<FeePaymentTestInstance> {
    const signer = await testNodeWallet()
    const templateId = (await Certificate.deploy(signer, {
      initialFields: { index: 0n, args: '', parentId: '' },
    })).contractInstance.contractId
    const result = await FeePaymentTest.deploy(signer, {
      initialFields: { totalSupply: 0n, latestIndex: 0n, certificateTemplateId: templateId },
    })
    return result.contractInstance
  }

  it('fee payment test', async () => {
    const feePaymentTest = await deployFeePaymentTest()
    expect((await tokenBalanceOf(feePaymentTest.address, ALPH_TOKEN_ID))).toEqual(ONE_ALPH)
    const contractState0 = await feePaymentTest.fetchState()
    expect(contractState0.fields.latestIndex).toEqual(0n)
    expect(contractState0.fields.totalSupply).toEqual(0n)

    const balance = ONE_ALPH * 10n
    const signer = await getSigner(balance)
    expect((await tokenBalanceOf(signer.address, ALPH_TOKEN_ID))).toEqual(balance)

    const feeAmount = ONE_ALPH * 4n
    const result = await RequestCertificate.execute(signer, {
      initialFields: { contract: feePaymentTest.contractId, args: '1122' },
      attoAlphAmount: feeAmount + DUST_AMOUNT
    })
    const txFee = BigInt(result.gasAmount) * BigInt(result.gasPrice)
    expect((await tokenBalanceOf(signer.address, ALPH_TOKEN_ID))).toEqual(balance - txFee - feeAmount)

    // the contract paid 1 alph for sub contract
    expect((await tokenBalanceOf(feePaymentTest.address, ALPH_TOKEN_ID))).toEqual(ONE_ALPH + feeAmount - ONE_ALPH)
    const contractState1 = await feePaymentTest.fetchState()
    expect(contractState1.fields.latestIndex).toEqual(1n)
    expect(contractState1.fields.totalSupply).toEqual(1n)

    const tokenId = subContractId(feePaymentTest.contractId, '01', signer.group)
    expect((await tokenBalanceOf(signer.address, tokenId))).toEqual(1n)
  }, 20000)
})
