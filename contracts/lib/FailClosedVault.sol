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

/// @dev `Vault` is a higher level contract built off of the `Escapable`
///  contract that holds funds and automates payments.
contract FailClosedVault is Vault {
    uint constant public TIME_DELAY = 48 hours;

    uint public securityGuardLastCheckin;

    function FailClosedVault(
        address _escapeHatchCaller,
        address _escapeHatchDestination,
        address _securityGuard,
        uint _maxSecurityGuardDelay
    ) Vault(
        _escapeHatchCaller,
        _escapeHatchDestination, 
        TIME_DELAY,
        TIME_DELAY,
        _securityGuard,
        _maxSecurityGuardDelay
    ) public {
    }
/////////
// Spender Interface
/////////


    /// @notice only `allowedSpenders[]` The recipient of a payment calls this
    ///  function to send themselves the ether after the `earliestPayTime` has
    ///  expired
    /// @param _idPayment The payment ID to be executed
    function collectAuthorizedPayment(uint _idPayment) whenNotPaused public {
        // Check that the `_idPayment` has been added to the payments struct
        require(_idPayment < authorizedPayments.length);

        Payment storage p = authorizedPayments[_idPayment];
        // The min delay for a payment is `TIME_DELAY`. Thus the following ensuress
        // that the `securityGuard` has checked in after the payment was created
        // @notice earliestPayTime is updated when a payment is delayed. Which may require
        // another checkIn before the payment can be collected.
        require(securityGuardLastCheckin >= p.earliestPayTime - TIME_DELAY);

        super.collectAuthorizedPayment(_idPayment);
    }

/////////
// SecurityGuard Interface
/////////

    /// @notice `onlySecurityGuard` can checkin. If they fail to checkin,
    /// payments will not be allowed to be collected, unless the payment has
    /// an `earliestPayTime` <= `securityGuardLastCheckin`.
    function checkIn() onlySecurityGuard external {
        securityGuardLastCheckin = _getTime();
    }
}