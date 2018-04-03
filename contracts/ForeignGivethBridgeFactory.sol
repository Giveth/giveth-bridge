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
import "./ForeignGivethBridge.sol";

contract ForeignGivethBridgeFactory {

    event Deployed(address destination);

    function ForeignGivethBridgeFactory(
        address _baseForeignGivethBridge,
        address _owner,
        address _escapeHatchCaller,
        address _escapeHatchDestination,
        address _tokenFactory,
        address _liquidPledging
    ) public 
    {
        require(_baseForeignGivethBridge != 0);

        ForeignGivethBridge bridge = ForeignGivethBridge(new DelegateProxy(_baseForeignGivethBridge));
        bridge.initialize(_owner, _escapeHatchCaller, _escapeHatchDestination, _tokenFactory, _liquidPledging);

        emit Deployed(address(bridge));
        selfdestruct(msg.sender);
    }
}