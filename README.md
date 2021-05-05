# QF
a quadratic funding implementation on Solana

## Quick Start
1. Setup [Solana](https://github.com/solana-labs/solana)
2. run solana-testnet-validator in local
2. npm install
3. npm run start

## Program

there are some instructions in the program

### StartRound

Start a new round. The valut controlled by the program derrived address. If the init valut is not empty, the value will be treated as a fund in the round.

### Donate

Add more fund in a round.

### RegisterProject

Register a project to the round.

### InitVoter

You need to init a voter if you want to vote. There are different voters for different project.


### Vote

Vote to a project which you like.

### Withdraw

When a round is end, project owner can withdraw the fund they got.

### EndRound

Only owenr of round can end a round.

## Page

There is a quick frontend page in src/page