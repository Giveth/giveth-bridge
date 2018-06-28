pragma solidity ^0.4.21;

/*
    Copyright 2018, RJ Ewing <perissology@protonmail.com>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import "giveth-common-contracts/contracts/Escapable.sol";
import "minimetoken/contracts/MiniMeToken.sol";
import "./lib/Pausable.sol";
import "./IForeignGivethBridge.sol";


contract ForeignGivethBridge is IForeignGivethBridge, Escapable, Pausable, TokenController {
    MiniMeTokenFactory public tokenFactory;
    address public liquidPledging;
    address public depositor;

    mapping(address => address) public tokenMapping;
    mapping(address => address) public inverseTokenMapping;

    event Deposit(address indexed sender, address token, uint amount, bytes32 homeTx, bytes data);
    event Withdraw(address indexed recipient, address token, uint amount);
    event TokenAdded(address indexed mainToken, address sideToken);

    modifier onlyDepositor {
        require(msg.sender == depositor);
        _;
    }

    /**
    * @param _escapeHatchCaller The address of a trusted account or contract to
    *  call `escapeHatch()` to send the ether in this contract to the
    *  `escapeHatchDestination` in the case on an emergency. it would be ideal 
    *  if `escapeHatchCaller` cannot move funds out of `escapeHatchDestination`
    * @param _escapeHatchDestination The address of a safe location (usually a
    *  Multisig) to send the ether held in this contract in the case of an emergency
    * @param _tokenFactory Address of the MiniMeTokenFactory instance used to deploy a new sideToken
    * @param _liquidPledging Address of the liquidPledging instance for this bridge
    * @param _depositor address that can deposit into this contract
    * @param mainTokens (optional) used for transferring existing tokens to a new bridge deployment.
    *   There must be 1 mainToken for every sideToken
    * @param sideTokens (optional) used for transferring existing tokens to a new bridge deployment.
    *   There must be 1 sideToken for every mainToken. Each sidetoken must inherit Controlled.sol 
    *   This contract will need to be set as the controller before the bridge can be used.
    */
    function ForeignGivethBridge(
        address _escapeHatchCaller,
        address _escapeHatchDestination, 
        address _tokenFactory,
        address _liquidPledging,
        address _depositor,
        address[] mainTokens,
        address[] sideTokens
    ) Escapable(_escapeHatchCaller, _escapeHatchDestination) public 
    {
        require(_tokenFactory != 0);
        require(_liquidPledging != 0);
        require(mainTokens.length == sideTokens.length);

        tokenFactory = MiniMeTokenFactory(_tokenFactory);
        liquidPledging = _liquidPledging;
        depositor = _depositor;

        for (uint i = 0; i < mainTokens.length; i++) {
            address mainToken = mainTokens[i];
            address sideToken = sideTokens[i];
            MiniMeToken(sideToken).approve(liquidPledging, uint(-1));
            tokenMapping[mainToken] = sideToken;
            inverseTokenMapping[sideToken] = mainToken;
            emit TokenAdded(mainToken, sideToken);
        }
    }

////////////////////
// Public Functions 
////////////////////

    /**
    * withdraw funds to the home network
    *
    * @dev This signals to the bridge service that we should release
    *   tokens/eth on the home netowork to msg.sender
    * @param sideToken The token on this network we are withdrawing
    * @param amount The amount to withdraw
    */
    function withdraw(address sideToken, uint amount) external {
        withdraw(msg.sender, sideToken, amount);
    }

    /**
    * withdraw funds to the home network
    *
    * @dev This signals to the bridge service that we should release
    *   tokens/eth on the home netowork to msg.sender
    * @param recipient The address we should release the funds to on the
    *   home network
    * @param sideToken The token on this network we are withdrawing
    * @param amount The amount to withdraw
    */
    function withdraw(address recipient, address sideToken, uint amount) whenNotPaused public {
        address mainToken = inverseTokenMapping[sideToken];
        require(mainToken != 0 || tokenMapping[0] == sideToken);

        // burn the tokens we want to withdraw
        MiniMeToken(sideToken).destroyTokens(msg.sender, amount);

        emit Withdraw(recipient, mainToken, amount);
    }

///////////////////////
// Depositor Interface
///////////////////////

    /**
    * deposit funds from the home network to this network
    *
    * @param sender The address on the home network that deposited the funds
    * @param mainToken The token on the main network we are depositing
    * @param amount The amount to withdraw
    * @param homeTx The hash of the tx on the home network where the funds were deposited
    * @param data The abi encoded data we call `liquidPledging` with. This should be some form
    *  of "donate" on liquidPledging (donate, donateAndCreateGiver, etc);
    */
    function deposit(address sender, address mainToken, uint amount, bytes32 homeTx, bytes data) onlyDepositor external {
        address sideToken = tokenMapping[mainToken];
        // if the mainToken isn't mapped, we can't accept the deposit
        require(sideToken != 0);

        // mint tokens we are depositing
        MiniMeToken(sideToken).generateTokens(address(this), amount);

        // ensure that liquidPledging still as a transfer allownce from this contract
        // and topup if needed
        if (MiniMeToken(sideToken).allowance(address(this), liquidPledging) < amount) {
            // need to set to 0 before we can update
            MiniMeToken(sideToken).approve(liquidPledging, 0);
            MiniMeToken(sideToken).approve(liquidPledging, uint(-1));
        }

        require(liquidPledging.call(data));
        emit Deposit(sender, mainToken, amount, homeTx, data);
    }

///////////////////
// Owner Interface
///////////////////

    /**
    * Map a token from the home network to this network. This will deploy
    * a new MiniMeToken 
    *
    * @param mainToken The token on the home network we are mapping
    * @param tokenName The name of the MiniMeToken to be deployed
    * @param decimals The number of decimals the sideToken will have.
    *   This should be the same as the mainToken
    * @param tokenSymbol The symbol of the MiniMeToken to be deployed
    */
    function addToken(address mainToken, string tokenName, uint8 decimals, string tokenSymbol) onlyOwner external {
        // ensure we haven't already mapped this token
        require(tokenMapping[mainToken] == 0);
        MiniMeToken sideToken = new MiniMeToken(tokenFactory, 0x0, 0, tokenName, decimals, tokenSymbol, true);
        sideToken.approve(liquidPledging, uint(-1));
        tokenMapping[mainToken] = address(sideToken);
        inverseTokenMapping[address(sideToken)] = mainToken;
        emit TokenAdded(mainToken, address(sideToken));
    }

    /**
    * Owner can update the depositor address
    * @param newDepositor The address who is allowed to make deposits
    */
    function changeDepositor(address newDepositor) onlyOwner external {
        depositor = newDepositor;
    }

////////////////
// TokenController
////////////////

    /// @notice Called when `_owner` sends ether to the MiniMe Token contract
    /// @param _owner The address that sent the ether to create tokens
    /// @return True if the ether is accepted, false if it throws
    function proxyPayment(address _owner) public payable returns(bool) {
        return false;
    }

    /// @notice Notifies the controller about a token transfer allowing the
    ///  controller to react if desired
    /// @param _from The origin of the transfer
    /// @param _to The destination of the transfer
    /// @param _amount The amount of the transfer
    /// @return False if the controller does not authorize the transfer
    function onTransfer(address _from, address _to, uint _amount) public returns(bool) {
        return true;
    }

    /// @notice Notifies the controller about an approval allowing the
    ///  controller to react if desired
    /// @param _owner The address that calls `approve()`
    /// @param _spender The spender in the `approve()` call
    /// @param _amount The amount in the `approve()` call
    /// @return False if the controller does not authorize the approval
    function onApprove(address _owner, address _spender, uint _amount) public returns(bool) {
        return true;
    }
}