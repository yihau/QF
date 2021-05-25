import * as BN from "bn.js";
import * as BufferLayout from "buffer-layout";
import {
  Account,
  Connection,
  BpfLoader,
  BPF_LOADER_PROGRAM_ID,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  SystemInstruction,
} from "@solana/web3.js";
import * as SPLToken from "@solana/spl-token";
import { newAccountWithLamports } from "./util/new-account-with-lamports";
import * as fs from "mz/fs";

async function main() {
  // create connection
  let url = "http://localhost:8899";
  let connection = new Connection(url, "singleGossip");
  const version = await connection.getVersion();
  console.log("Connection to cluster established:", url, version);
  console.log("");

  // init some roles
  let feePayer = await newAccountWithLamports(connection, 1e11);
  let { player: angleInvestor, playerTokenHolderPubkey: angleInvestorTokenHolderPubkey } = await InitPlayer(
    connection,
    feePayer,
    1e10
  );

  // deploy program
  console.log("Deploy Program...");
  let QFProgramID = await DeployProgram(connection, feePayer);
  console.log("Program ID:", QFProgramID.toBase58());
  console.log("");

  // start new round
  let {
    owner: roundOwner,
    roundPubkey,
    vaultPubkey,
    txHash: createNewRoundTxHash,
  } = await CreateNewRound(connection, feePayer, QFProgramID);
  console.log("=> Start New Round", createNewRoundTxHash);
  await printRoundInfo(connection, roundPubkey);
  console.log("vault owner", (await getVaultOwnerPubkey(roundPubkey, QFProgramID)).toBase58());

  let { txHash: donateTxHash } = await Donate(
    connection,
    feePayer,
    QFProgramID,
    roundPubkey,
    angleInvestorTokenHolderPubkey,
    SPLToken.NATIVE_MINT,
    vaultPubkey,
    angleInvestor,
    1e9,
    9
  );
  console.log("=> Donate", donateTxHash);
  await printRoundInfo(connection, roundPubkey);

  // register project 1
  let {
    txHash: registerProject1TxHash,
    projectPubkey: project1Pubkey,
    owner: project1Owner,
  } = await RegisterProject(connection, feePayer, roundPubkey, QFProgramID);
  console.log("=> Register Project 1", registerProject1TxHash);
  await printProjectInfo(connection, project1Pubkey);

  // register project 2
  let {
    txHash: registerProject2TxHash,
    projectPubkey: project2Pubkey,
    owner: project2Owner,
  } = await RegisterProject(connection, feePayer, roundPubkey, QFProgramID);
  console.log("=> Register Project 2", registerProject2TxHash);
  await printProjectInfo(connection, project2Pubkey);

  // init Alice
  let { player: Alice, playerTokenHolderPubkey: AliceTokenHolderPubkey } = await InitPlayer(connection, feePayer, 1e10);

  // init Alice project 1 voter
  let { txHash: initAliceProject1VoterTxHash, voterPubkey: AliceProject1VoterPubkey } = await InitVoter(
    connection,
    feePayer,
    feePayer,
    project1Pubkey,
    AliceTokenHolderPubkey,
    QFProgramID
  );
  console.log("=> Init Alice Projcet 1 Voter", initAliceProject1VoterTxHash);
  printVoterInfo(connection, AliceProject1VoterPubkey, "Alice Project 1 Voter");

  // init Alice project 2 voter
  let { txHash: initAliceProject2VoterTxHash, voterPubkey: AliceProject2VoterPubkey } = await InitVoter(
    connection,
    feePayer,
    feePayer,
    project2Pubkey,
    AliceTokenHolderPubkey,
    QFProgramID
  );
  console.log("=> Init Alice Projcet 2 Voter", initAliceProject2VoterTxHash);
  printVoterInfo(connection, AliceProject2VoterPubkey, "Alice Project 2 Voter");

  // Alice vote project 1
  let { txHash: aliceVoteProject1TxHash } = await Vote(
    connection,
    feePayer,
    QFProgramID,
    roundPubkey,
    project1Pubkey,
    AliceProject1VoterPubkey,
    AliceTokenHolderPubkey,
    SPLToken.NATIVE_MINT,
    vaultPubkey,
    Alice,
    1e9,
    9
  );
  console.log("=> Alice Vote Project 1", aliceVoteProject1TxHash);
  await printRoundInfo(connection, roundPubkey);
  await printProjectInfo(connection, project1Pubkey, "Project 1");
  await printProjectInfo(connection, project2Pubkey, "Project 2");
  await printVoterInfo(connection, AliceProject1VoterPubkey, "Alice Project 1 Voter");

  // Alice vote project 2
  let { txHash: aliceVoteProject2TxHash } = await Vote(
    connection,
    feePayer,
    QFProgramID,
    roundPubkey,
    project2Pubkey,
    AliceProject2VoterPubkey,
    AliceTokenHolderPubkey,
    SPLToken.NATIVE_MINT,
    vaultPubkey,
    Alice,
    1e9,
    9
  );
  console.log("=> Alice Vote Project 2", aliceVoteProject2TxHash);
  await printRoundInfo(connection, roundPubkey);
  await printProjectInfo(connection, project1Pubkey, "Project 1");
  await printProjectInfo(connection, project2Pubkey, "Project 2");
  await printVoterInfo(connection, AliceProject2VoterPubkey, "Alice Project 2 Voter");

  // init Bob
  let { player: bob, playerTokenHolderPubkey: bobTokenHolderPubkey } = await InitPlayer(connection, feePayer, 1e10);

  // init Bob project 1 voter
  let { txHash: initBobProject1Voter, voterPubkey: bobProject1VoterPubkey } = await InitVoter(
    connection,
    feePayer,
    feePayer,
    project1Pubkey,
    bobTokenHolderPubkey,
    QFProgramID
  );
  console.log("=> Init Bob Projcet 1 Voter", initBobProject1Voter);
  printVoterInfo(connection, bobProject1VoterPubkey, "Bob Project 1 Voter");

  // Bob vote project 1
  let { txHash: bobVoteProject1TxHash } = await Vote(
    connection,
    feePayer,
    QFProgramID,
    roundPubkey,
    project1Pubkey,
    bobProject1VoterPubkey,
    bobTokenHolderPubkey,
    SPLToken.NATIVE_MINT,
    vaultPubkey,
    bob,
    1e9,
    9
  );

  console.log("=> Bob Vote Project 1", bobVoteProject1TxHash);
  await printRoundInfo(connection, roundPubkey);
  await printProjectInfo(connection, project1Pubkey, "Project 1");
  await printProjectInfo(connection, project2Pubkey, "Project 2");
  await printVoterInfo(connection, bobProject1VoterPubkey, "Bob Project 1 Voter");

  // Bob vote project 1 again
  let { txHash: bobVoteProject1AgainTxHash } = await Vote(
    connection,
    feePayer,
    QFProgramID,
    roundPubkey,
    project1Pubkey,
    bobProject1VoterPubkey,
    bobTokenHolderPubkey,
    SPLToken.NATIVE_MINT,
    vaultPubkey,
    bob,
    1e9,
    9
  );
  console.log("=> Bob Vote Project 1 Again", bobVoteProject1AgainTxHash);
  await printRoundInfo(connection, roundPubkey);
  await printProjectInfo(connection, project1Pubkey, "Project 1");
  await printProjectInfo(connection, project2Pubkey, "Project 2");
  await printVoterInfo(connection, bobProject1VoterPubkey, "Bob Project 1 Voter");

  let { txHash: endRoundTxHash } = await EndRound(connection, roundPubkey, roundOwner, QFProgramID);
  console.log("=> End Round", endRoundTxHash);
  await printRoundInfo(connection, roundPubkey);

  // init project 1 withdraw receiver
  let { playerTokenHolderPubkey: project1WithdrawReceiverPubkey } = await InitPlayer(
    connection,
    feePayer,
    await connection.getMinimumBalanceForRentExemption(SPLToken.AccountLayout.span)
  );
  console.log("=> Init Project 1 Token Receiver");
  await printTokenAccount(connection, feePayer, project1WithdrawReceiverPubkey, "Project 1 Token Receiver");

  // init project 2 withdraw receiver
  let { playerTokenHolderPubkey: project2WithdrawReceiverPubkey } = await InitPlayer(
    connection,
    feePayer,
    await connection.getMinimumBalanceForRentExemption(SPLToken.AccountLayout.span)
  );
  console.log("=> Init Project 2 Token Receiver");
  await printTokenAccount(connection, feePayer, project2WithdrawReceiverPubkey, "Project 2 Token Receiver");

  // init owner withdraw receiver
  let { playerTokenHolderPubkey: roundOwnerWithdrawReceiverPubkey } = await InitPlayer(
    connection,
    feePayer,
    await connection.getMinimumBalanceForRentExemption(SPLToken.AccountLayout.span)
  );
  console.log("=> Init Round Owner Token Receiver");
  await printTokenAccount(connection, feePayer, roundOwnerWithdrawReceiverPubkey, "Round Owner Token Receiver");

  let { txHash: project1WithdrawTxHash } = await Withdraw(
    connection,
    feePayer,
    QFProgramID,
    roundPubkey,
    vaultPubkey,
    await getVaultOwnerPubkey(roundPubkey, QFProgramID),
    project1Pubkey,
    project1Owner,
    project1WithdrawReceiverPubkey
  );
  console.log("=> Project 1 Withdraw", project1WithdrawTxHash);
  await printRoundInfo(connection, roundPubkey);
  await printProjectInfo(connection, project1Pubkey);
  await printTokenAccount(connection, feePayer, vaultPubkey, "Round Vault");
  await printTokenAccount(connection, feePayer, project1WithdrawReceiverPubkey, "Project 1 Token Receiver");

  let { txHash: withdrawFee1TxHash } = await WithdrawFee(
    connection,
    feePayer,
    QFProgramID,
    roundPubkey,
    roundOwner,
    vaultPubkey,
    await getVaultOwnerPubkey(roundPubkey, QFProgramID),
    roundOwnerWithdrawReceiverPubkey
  );
  console.log("=> Withdraw Fee", withdrawFee1TxHash);
  await printRoundInfo(connection, roundPubkey);
  await printTokenAccount(connection, feePayer, vaultPubkey, "Round Vault");

  let { txHash: project2WithdrawTxHash } = await Withdraw(
    connection,
    feePayer,
    QFProgramID,
    roundPubkey,
    vaultPubkey,
    await getVaultOwnerPubkey(roundPubkey, QFProgramID),
    project2Pubkey,
    project2Owner,
    project2WithdrawReceiverPubkey
  );

  console.log("=> Project 2 Withdraw", project2WithdrawTxHash);
  await printRoundInfo(connection, roundPubkey);
  await printProjectInfo(connection, project2Pubkey);
  await printTokenAccount(connection, feePayer, vaultPubkey, "Round Vault");
  await printTokenAccount(connection, feePayer, project2WithdrawReceiverPubkey, "Project 2 Token Receiver");

  let { txHash: withdrawFee2TxHash } = await WithdrawFee(
    connection,
    feePayer,
    QFProgramID,
    roundPubkey,
    roundOwner,
    vaultPubkey,
    await getVaultOwnerPubkey(roundPubkey, QFProgramID),
    roundOwnerWithdrawReceiverPubkey
  );
  console.log("=> Withdraw Fee", withdrawFee2TxHash);
  await printRoundInfo(connection, roundPubkey);
  await printTokenAccount(connection, feePayer, vaultPubkey, "Round Vault");
}

main().then(
  () => process.exit(),
  (err) => {
    console.error(err);
    process.exit(-1);
  }
);

enum Instruction {
  StartRound,
  Donate, //  { amount: u64, decimals: u8 },
  RegisterProject,
  InitVoter,
  Vote, // { amount: u64, decimals: u8 },
  Withdraw,
  EndRound,
  WithdrawFee,
}

function createStartRoundInstruction(
  programId: PublicKey,
  newRoundPubkey: PublicKey,
  roundOwnerPubkey: PublicKey,
  funderPubkey: PublicKey,
  associatedTokenAccountPubkey: PublicKey,
  walletAccountPubkey: PublicKey,
  mintPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([BufferLayout.u8("instruction")]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.StartRound,
    },
    data
  );

  let keys = [
    {
      pubkey: newRoundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: roundOwnerPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SPLToken.ASSOCIATED_TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: funderPubkey,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: associatedTokenAccountPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: walletAccountPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: mintPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SPLToken.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function registerProjectInstruction(
  programId: PublicKey,
  newProjectPubkey: PublicKey,
  roundPubkey: PublicKey,
  projectOwnerPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([BufferLayout.u8("instruction")]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.RegisterProject,
    },
    data
  );

  let keys = [
    {
      pubkey: newProjectPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: projectOwnerPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function initVoterInstruction(
  programId: PublicKey,
  voterPubkey: PublicKey,
  voterTokenHolderPubkey: PublicKey,
  projectPubkey: PublicKey,
  fromPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([BufferLayout.u8("instruction")]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.InitVoter,
    },
    data
  );

  let keys = [
    {
      pubkey: voterPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: voterTokenHolderPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: projectPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: fromPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function donateInstruction(
  programId: PublicKey,
  roundPubkey: PublicKey,
  fromPubkey: PublicKey,
  mintPubkey: PublicKey,
  toPubkey: PublicKey,
  fromAuthPubkey: PublicKey,
  amount: number,
  decimals: number
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([
    BufferLayout.u8("instruction"),
    BufferLayout.blob(8, "amount"),
    BufferLayout.u8("decimals"),
  ]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.Donate,
      amount: new BN(amount).toBuffer("le", 8),
      decimals,
    },
    data
  );

  let keys = [
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: fromPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: mintPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: toPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: fromAuthPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: SPLToken.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function voteInstruction(
  programId: PublicKey,
  roundPubkey: PublicKey,
  projectPubkey: PublicKey,
  voterPubkey: PublicKey,
  fromPubkey: PublicKey,
  mintPubkey: PublicKey,
  toPubkey: PublicKey,
  fromAuthPubkey: PublicKey,
  amount: number,
  decimals: number
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([
    BufferLayout.u8("instruction"),
    BufferLayout.blob(8, "amount"),
    BufferLayout.u8("decimals"),
  ]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.Vote,
      amount: new BN(amount).toBuffer("le", 8),
      decimals,
    },
    data
  );

  let keys = [
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: projectPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: voterPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: fromPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: mintPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: toPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: fromAuthPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: SPLToken.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function withdrawInstruction(
  programId: PublicKey,
  roundPubkey: PublicKey,
  vaultPubkey: PublicKey,
  vaultOwnerPubkey: PublicKey,
  projectPubkey: PublicKey,
  projectOwnerPubkey: PublicKey,
  toPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([BufferLayout.u8("instruction")]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.Withdraw,
    },
    data
  );

  let keys = [
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: vaultPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: vaultOwnerPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: projectPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: projectOwnerPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: toPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: SPLToken.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function endRoundInstruction(
  programId: PublicKey,
  roundPubkey: PublicKey,
  ownerPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([BufferLayout.u8("instruction")]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.EndRound,
    },
    data
  );

  let keys = [
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: ownerPubkey,
      isSigner: true,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function withdrawFeeInstruction(
  programId: PublicKey,
  roundPubkey: PublicKey,
  ownerPubkey: PublicKey,
  vaultPubkey: PublicKey,
  vaultOwnerPubkey: PublicKey,
  toPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([BufferLayout.u8("instruction")]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.WithdrawFee,
    },
    data
  );

  let keys = [
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: ownerPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: vaultPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: vaultOwnerPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: toPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: SPLToken.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

async function getVaultOwnerPubkey(round: PublicKey, programId: PublicKey): Promise<PublicKey> {
  let [pda] = await PublicKey.findProgramAddress([round.toBuffer()], programId);
  return pda;
}

async function getVoterPubkey(
  project: PublicKey,
  voterTokenAccountPubkey: PublicKey,
  programId: PublicKey
): Promise<PublicKey> {
  let [pda] = await PublicKey.findProgramAddress([project.toBuffer(), voterTokenAccountPubkey.toBuffer()], programId);
  return pda;
}

async function CreateNewRound(connection: Connection, feePayer: Account, programId: PublicKey): Promise<any> {
  let owner = await newAccountWithLamports(connection, 10000000000);
  let round = new Account();
  let vaultOwnerPubkey = await getVaultOwnerPubkey(round.publicKey, programId);
  let vaultPubkey = await SPLToken.Token.getAssociatedTokenAddress(
    SPLToken.ASSOCIATED_TOKEN_PROGRAM_ID,
    SPLToken.TOKEN_PROGRAM_ID,
    SPLToken.NATIVE_MINT,
    vaultOwnerPubkey
  );

  const tx = new Transaction()
    .add(
      SystemProgram.createAccount({
        fromPubkey: owner.publicKey,
        newAccountPubkey: round.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(RoundAccountDataLayout.span),
        space: RoundAccountDataLayout.span,
        programId: programId,
      })
    )
    .add(
      createStartRoundInstruction(
        programId,
        round.publicKey,
        owner.publicKey,
        owner.publicKey,
        vaultPubkey,
        vaultOwnerPubkey,
        SPLToken.NATIVE_MINT
      )
    );

  let txHash = await sendAndConfirmTransaction(connection, tx, [feePayer, owner, round], {
    commitment: "singleGossip",
    preflightCommitment: "singleGossip",
  });

  return {
    txHash: txHash,
    owner: owner,
    vaultPubkey: vaultPubkey,
    roundPubkey: round.publicKey,
  };
}

async function InitVoter(
  connection: Connection,
  feePayer: Account,
  from: Account,
  projectPubkey: PublicKey,
  voterTokenAccountPubkey: PublicKey,
  programId: PublicKey
): Promise<any> {
  let voterPubkey = await getVoterPubkey(projectPubkey, voterTokenAccountPubkey, programId);
  const tx = new Transaction().add(
    initVoterInstruction(programId, voterPubkey, voterTokenAccountPubkey, projectPubkey, from.publicKey)
  );

  let txHash = await sendAndConfirmTransaction(connection, tx, [feePayer, from], {
    commitment: "singleGossip",
    preflightCommitment: "singleGossip",
  });

  return {
    txHash: txHash,
    voterPubkey: voterPubkey,
  };
}

async function RegisterProject(
  connection: Connection,
  feePayer: Account,
  roundPubkey: PublicKey,
  programId: PublicKey
): Promise<any> {
  let owner = new Account();
  let project = new Account();

  const tx = new Transaction()
    .add(
      SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: project.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(ProjectAccountDataLayout.span),
        space: ProjectAccountDataLayout.span,
        programId: programId,
      })
    )
    .add(registerProjectInstruction(programId, project.publicKey, roundPubkey, owner.publicKey));

  let txHash = await sendAndConfirmTransaction(connection, tx, [feePayer, project], {
    commitment: "singleGossip",
    preflightCommitment: "singleGossip",
  });

  return {
    txHash: txHash,
    projectPubkey: project.publicKey,
    owner: owner,
  };
}

async function Donate(
  connection: Connection,
  feePayer: Account,
  programId: PublicKey,
  roundPubkey: PublicKey,
  fromPubkey: PublicKey,
  mintPubkey: PublicKey,
  toPubkey: PublicKey,
  fromAuth: Account,
  amount: number,
  decimals: number
): Promise<any> {
  const tx = new Transaction().add(
    donateInstruction(programId, roundPubkey, fromPubkey, mintPubkey, toPubkey, fromAuth.publicKey, amount, decimals)
  );

  let txHash = await sendAndConfirmTransaction(connection, tx, [feePayer, fromAuth], {
    commitment: "singleGossip",
    preflightCommitment: "singleGossip",
  });

  return {
    txHash: txHash,
  };
}

async function Vote(
  connection: Connection,
  feePayer: Account,
  programId: PublicKey,
  roundPubkey: PublicKey,
  projectPubkey: PublicKey,
  voterPubkey: PublicKey,
  fromPubkey: PublicKey,
  mintPubkey: PublicKey,
  toPubkey: PublicKey,
  fromAuth: Account,
  amount: number,
  decimals: number
): Promise<any> {
  const tx = new Transaction().add(
    voteInstruction(
      programId,
      roundPubkey,
      projectPubkey,
      voterPubkey,
      fromPubkey,
      mintPubkey,
      toPubkey,
      fromAuth.publicKey,
      amount,
      decimals
    )
  );

  let txHash = await sendAndConfirmTransaction(connection, tx, [feePayer, fromAuth], {
    commitment: "singleGossip",
    preflightCommitment: "singleGossip",
  });

  return {
    txHash: txHash,
  };
}

async function Withdraw(
  connection: Connection,
  feePayer: Account,
  programId: PublicKey,
  roundPubkey: PublicKey,
  vaultPubkey: PublicKey,
  vaultOwnerPubkey: PublicKey,
  projectPubkey: PublicKey,
  projectOwner: Account,
  toPubkey: PublicKey
): Promise<any> {
  const tx = new Transaction().add(
    withdrawInstruction(
      programId,
      roundPubkey,
      vaultPubkey,
      vaultOwnerPubkey,
      projectPubkey,
      projectOwner.publicKey,
      toPubkey
    )
  );

  let txHash = await sendAndConfirmTransaction(connection, tx, [feePayer, projectOwner], {
    commitment: "singleGossip",
    preflightCommitment: "singleGossip",
  });

  return {
    txHash: txHash,
  };
}

async function EndRound(
  connection: Connection,
  roundPubkey: PublicKey,
  owner: Account,
  programId: PublicKey
): Promise<any> {
  const tx = new Transaction().add(endRoundInstruction(programId, roundPubkey, owner.publicKey));

  let txHash = await sendAndConfirmTransaction(connection, tx, [owner], {
    commitment: "singleGossip",
    preflightCommitment: "singleGossip",
  });

  return {
    txHash: txHash,
  };
}

async function WithdrawFee(
  connection: Connection,
  feePayer: Account,
  programId: PublicKey,
  roundPubkey: PublicKey,
  owner: Account,
  vaultPubkey: PublicKey,
  vaultOwnerPubkey: PublicKey,
  toPubkey: PublicKey
): Promise<any> {
  const tx = new Transaction().add(
    withdrawFeeInstruction(programId, roundPubkey, owner.publicKey, vaultPubkey, vaultOwnerPubkey, toPubkey)
  );

  let txHash = await sendAndConfirmTransaction(connection, tx, [feePayer, owner], {
    commitment: "singleGossip",
    preflightCommitment: "singleGossip",
  });

  return {
    txHash: txHash,
  };
}

type Round = {
  roundStatus: number; // u8
  fund: BN; // u64
  fee: BN; // u64
  vault: PublicKey;
  owner: PublicKey;
  area: BN; // u256
};

const RoundAccountDataLayout = BufferLayout.struct([
  BufferLayout.u8("roundStatus"),
  BufferLayout.blob(8, "fund"),
  BufferLayout.blob(8, "fee"),
  BufferLayout.blob(32, "vault"),
  BufferLayout.blob(32, "owner"),
  BufferLayout.blob(32, "area"),
]);

async function printRoundInfo(connection: Connection, round: PublicKey): Promise<void> {
  let info = await getRoundInfo(connection, round);
  console.log("================ Round ================");
  console.log("round:", round.toBase58());
  console.log("status", info.roundStatus);
  console.log("owner", info.owner.toBase58());
  console.log("vault", info.vault.toBase58());
  console.log("fund", info.fund.toString());
  console.log("fee", info.fee.toString());
  console.log("area", info.area.toString());
  console.log("");
}

async function getRoundInfo(connection: Connection, round: PublicKey): Promise<Round> {
  const info = await connection.getAccountInfo(round);
  if (info === null) {
    throw new Error("Failed to find");
  }

  const data = Buffer.from(info.data);
  const roundInfo = RoundAccountDataLayout.decode(data);
  roundInfo.fund = new BN(roundInfo.fund, 10, "le");
  roundInfo.fee = new BN(roundInfo.fee, 10, "le");
  roundInfo.vault = new PublicKey(roundInfo.vault);
  roundInfo.owner = new PublicKey(roundInfo.owner);
  roundInfo.area = new BN(roundInfo.area, 10, "le");

  return roundInfo;
}

type Project = {
  round: PublicKey;
  owner: PublicKey;
  withdraw: boolean;
  votes: BN; // u64
  area: BN; // u256
  area_sqrt: BN; // u256
};

const ProjectAccountDataLayout = BufferLayout.struct([
  BufferLayout.blob(32, "round"),
  BufferLayout.blob(32, "owner"),
  BufferLayout.u8("withdraw"),
  BufferLayout.blob(8, "votes"),
  BufferLayout.blob(32, "area"),
  BufferLayout.blob(32, "area_sqrt"),
]);

async function getProjectInfo(connection: Connection, project: PublicKey): Promise<Project> {
  const info = await connection.getAccountInfo(project);
  if (info === null) {
    throw new Error("Failed to find");
  }

  const data = Buffer.from(info.data);
  const projectInfo = ProjectAccountDataLayout.decode(data);
  projectInfo.round = new PublicKey(projectInfo.round);
  projectInfo.owner = new PublicKey(projectInfo.owner);
  projectInfo.withdraw = projectInfo.withdraw == 1;
  projectInfo.votes = new BN(projectInfo.votes, 10, "le");
  projectInfo.area = new BN(projectInfo.area, 10, "le");
  projectInfo.area_sqrt = new BN(projectInfo.area_sqrt, 10, "le");

  return projectInfo;
}

async function printProjectInfo(connection: Connection, project: PublicKey, title = "Project"): Promise<void> {
  let info = await getProjectInfo(connection, project);
  console.log("================", title, "================");
  console.log("project:", project.toBase58());
  console.log("round:", info.round.toBase58());
  console.log("owner:", info.owner.toBase58());
  console.log("withdraw:", info.withdraw);
  console.log("votes", info.votes.toString());
  console.log("area", info.area.toString());
  console.log("");
}

type Voter = {
  isInit: boolean;
  votes: BN; // u64
  votes_sqrt: BN; // u64
};

const VoterAccountDataLayout = BufferLayout.struct([
  BufferLayout.u8("isInit"),
  BufferLayout.blob(8, "votes"),
  BufferLayout.blob(8, "votes_sqrt"),
]);

async function getVoterInfo(connection: Connection, voter: PublicKey): Promise<Voter> {
  const info = await connection.getAccountInfo(voter);
  if (info === null) {
    throw new Error("Failed to find");
  }

  const data = Buffer.from(info.data);
  const voterInfo = VoterAccountDataLayout.decode(data);
  voterInfo.isInit = voterInfo.isInit == 1;
  voterInfo.votes = new BN(voterInfo.votes, 10, "le");
  voterInfo.votes_sqrt = new BN(voterInfo.votes_sqrt, 10, "le");

  return voterInfo;
}

async function printVoterInfo(connection: Connection, voter: PublicKey, title = "Voter"): Promise<void> {
  let info = await getVoterInfo(connection, voter);
  console.log("================", title, "================");
  console.log("voter:", voter.toBase58());
  console.log("isInit:", info.isInit);
  console.log("votes:", info.votes.toString());
  console.log("votes sqrt:", info.votes_sqrt.toString());
  console.log("");
}

async function printTokenAccount(
  connection: Connection,
  feePayer: Account,
  tokenAccountPubkey: PublicKey,
  title = "Token Account"
): Promise<void> {
  let token = new SPLToken.Token(connection, SPLToken.NATIVE_MINT, SPLToken.TOKEN_PROGRAM_ID, feePayer);
  let info = await token.getAccountInfo(tokenAccountPubkey);
  console.log("================", title, "================");
  console.log("token account:", tokenAccountPubkey.toBase58());
  console.log("amount:", info.amount.toString());
  console.log("");
}

async function InitPlayer(connection: Connection, feePayer: Account, initBalance = 1000000000): Promise<any> {
  let player = await newAccountWithLamports(connection, initBalance);
  let playerTokenHolder = new Account();
  const tx = new Transaction()
    .add(
      SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: playerTokenHolder.publicKey,
        lamports: initBalance,
        space: SPLToken.AccountLayout.span,
        programId: SPLToken.TOKEN_PROGRAM_ID,
      })
    )
    .add(
      SPLToken.Token.createInitAccountInstruction(
        SPLToken.TOKEN_PROGRAM_ID,
        SPLToken.NATIVE_MINT,
        playerTokenHolder.publicKey,
        player.publicKey
      )
    );

  let txHash = await sendAndConfirmTransaction(connection, tx, [feePayer, playerTokenHolder], {
    commitment: "singleGossip",
    preflightCommitment: "singleGossip",
  });

  return {
    txHash: txHash,
    player: player,
    playerTokenHolderPubkey: playerTokenHolder.publicKey,
  };
}

async function DeployProgram(connection: Connection, feePayer: Account): Promise<PublicKey> {
  const data = await fs.readFile("src/program/target/deploy/qf.so");
  const programAccount = new Account();
  await BpfLoader.load(connection, feePayer, programAccount, data, BPF_LOADER_PROGRAM_ID);
  return programAccount.publicKey;
}
