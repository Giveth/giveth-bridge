pragma solidity ^0.4.21;

/*
    Copyright 2017, RJ Ewing <perissology@protonmail.com>

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

import "./DelegateProxy.sol";
import "./GivethBridge.sol";

contract GivethBridgeFactory {

    event Deployed(address destination);

    function GivethBridgeFactory(
        address _baseGivethBridge,
        address _owner,
        address _escapeHatchCaller,
        address _escapeHatchDestination,
        uint _absoluteMinTimeLock,
        uint _timeLock,
        address _securityGuard,
        uint _maxSecurityGuardDelay
    ) public 
    {
        require(_baseGivethBridge != 0);

        GivethBridge bridge = GivethBridge(new DelegateProxy(_baseGivethBridge));
        bridge.initialize(_owner, _escapeHatchCaller, _escapeHatchDestination, _absoluteMinTimeLock, _timeLock, _securityGuard, _maxSecurityGuardDelay);

        emit Deployed(address(bridge));
        selfdestruct(msg.sender);
    }
}