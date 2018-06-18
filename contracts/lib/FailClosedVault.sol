pragma solidity ^0.4.21;

/*
    Copyright 2018, RJ Ewing

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

import "./Vault.sol";

/**
* @dev `FailClosedVault` is a version of the vault that requires
*  the securityGuard to "see" each payment before it can be collected
*/
contract FailClosedVault is Vault {
    uint public securityGuardLastCheckin;

    /**
    * @param _absoluteMinTimeLock For this version of the vault, it is recommended
    *   that this value is > 24hrs. If not, it will require the securityGuard to checkIn
    *   multiple times a day. Also consider that `securityGuardLastCheckin >= payment.earliestPayTime - timelock + 30mins);`
    *   is the condition to allow payments to be payed. The additional 30 mins is to reduce (not eliminate)
    *   the risk of front-running
    */
    function FailClosedVault(
        address _escapeHatchCaller,
        address _escapeHatchDestination,
        uint _absoluteMinTimeLock,
        uint _timeLock,
        address _securityGuard,
        uint _maxSecurityGuardDelay
    ) Vault(
        _escapeHatchCaller,
        _escapeHatchDestination, 
        _absoluteMinTimeLock,
        _timeLock,
        _securityGuard,
        _maxSecurityGuardDelay
    ) public {
    }

/////////////////////
// Spender Interface
/////////////////////

    /**
    * Disburse an authorizedPayment to the recipient if all checks pass.
    *
    * @param _idPayment The payment ID to be disbursed
    */
    function disburseAuthorizedPayment(uint _idPayment) disbursementsAllowed public {
        // Check that the `_idPayment` has been added to the payments struct
        require(_idPayment < authorizedPayments.length);

        Payment storage p = authorizedPayments[_idPayment];
        // The current minimum delay for a payment is `timeLock`. Thus the following ensuress
        // that the `securityGuard` has checked in after the payment was created
        // @notice earliestPayTime is updated when a payment is delayed. Which may require
        // another checkIn before the payment can be collected.
        // @notice We add 30 mins to this to reduce (not eliminate) the risk of front-running
        require(securityGuardLastCheckin >= p.earliestPayTime - timeLock + 30 minutes);

        super.disburseAuthorizedPayment(_idPayment);
    }

///////////////////////////
// SecurityGuard Interface
///////////////////////////

    /**
    * @notice `onlySecurityGuard` can checkin. If they fail to checkin,
    * payments will not be allowed to be disbursed, unless the payment has
    * an `earliestPayTime` <= `securityGuardLastCheckin`.
    * @notice To reduce the risk of a front-running attack on payments, it
    * is important that this is called with a resonable gasPrice set for the
    * current network congestion. If this tx is not mined, within 30 mins
    * of being sent, it is possible that a payment can be authorized w/o the
    * securityGuard's knowledge
    */
    function checkIn() onlySecurityGuard external {
        securityGuardLastCheckin = _getTime();
    }
}