pragma solidity ^0.4.0;

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

interface IForeignGivethBridge {
    event Deposit(address indexed sender, address token, uint amount, bytes32 homeTx, bytes data);
    event Withdraw(address indexed recipient, address token, uint amount);
    event TokenAdded(address indexed mainToken, address sideToken);

    function withdraw(address sideToken, uint amount) external;
    function withdraw(address recipient, address sideToken, uint amount) public;

    function deposit(address sender, address mainToken, uint amount, bytes32 homeTx, bytes data) external;
    function addToken(address mainToken, string tokenName, uint8 decimals, string tokenSymbol) external;
}