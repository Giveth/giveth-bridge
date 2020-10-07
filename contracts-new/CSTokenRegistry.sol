
// File: @openzeppelin/contracts/GSN/Context.sol

pragma solidity ^0.5.0;

/*
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with GSN meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
contract Context {
    // Empty internal constructor, to prevent people from mistakenly deploying
    // an instance of this contract, which should be used via inheritance.
    constructor () internal { }
    // solhint-disable-previous-line no-empty-blocks

    function _msgSender() internal view returns (address payable) {
        return msg.sender;
    }

    function _msgData() internal view returns (bytes memory) {
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
        return msg.data;
    }
}
// File: @openzeppelin/contracts/ownership/Ownable.sol

pragma solidity ^0.5.0;

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor () internal {
        address msgSender = _msgSender();
        _owner = msgSender;
        emit OwnershipTransferred(address(0), msgSender);
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    /**
     * @dev Returns true if the caller is the current owner.
     */
    function isOwner() public view returns (bool) {
        return _msgSender() == _owner;
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions anymore. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby removing any functionality that is only available to the owner.
     */
    function renounceOwnership() public onlyOwner {
        emit OwnershipTransferred(_owner, address(0));
        _owner = address(0);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public onlyOwner {
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     */
    function _transferOwnership(address newOwner) internal {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

// File: @openzeppelin/contracts/access/Roles.sol

pragma solidity ^0.5.0;

/**
 * @title Roles
 * @dev Library for managing addresses assigned to a Role.
 */
library Roles {
    struct Role {
        mapping (address => bool) bearer;
    }

    /**
     * @dev Give an account access to this role.
     */
    function add(Role storage role, address account) internal {
        require(!has(role, account), "Roles: account already has role");
        role.bearer[account] = true;
    }

    /**
     * @dev Remove an account's access to this role.
     */
    function remove(Role storage role, address account) internal {
        require(has(role, account), "Roles: account does not have role");
        role.bearer[account] = false;
    }

    /**
     * @dev Check if an account has this role.
     * @return bool
     */
    function has(Role storage role, address account) internal view returns (bool) {
        require(account != address(0), "Roles: account is the zero address");
        return role.bearer[account];
    }
}


// File: localhost/contracts/AdminRole.sol

pragma solidity ^0.5.0;





/**
 * @title AdminRole
 * @dev Admins are responsible for assigning and removing contributors.
 */
contract AdminRole is Context, Ownable {
    using Roles for Roles.Role;

    event AdminAdded(address indexed account);
    event AdminRemoved(address indexed account);

    Roles.Role private _admins;

    constructor(address[] memory admins) internal {
        _addAdmin(_msgSender());
        emit AdminAdded(_msgSender());
        for (uint256 i = 0; i < admins.length; ++i) {
            _addAdmin(admins[i]);
            emit AdminAdded(admins[i]);
        }
    }

    modifier onlyAdmin() {
        require(
            isAdmin(_msgSender()),
            "AdminRole: caller does not have the Admin role"
        );
        _;
    }

    function isAdmin(address account) public view returns (bool) {
        return _admins.has(account);
    }

    function addAdmin(address account) public onlyAdmin {
        _addAdmin(account);
    }

    function renounceAdmin() public onlyAdmin {
        _removeAdmin(_msgSender());
    }

    function removeAdmin(address wallet) public onlyOwner {
        _removeAdmin(wallet);
    }

    function _addAdmin(address account) internal {
        _admins.add(account);
        emit AdminAdded(account);
    }

    function _removeAdmin(address account) internal {
        _admins.remove(account);
        emit AdminRemoved(account);
    }
}

// File: localhost/contracts/RegistryAbstract.sol

pragma solidity ^0.5.0;



contract RegistryAbstract is AdminRole {
    constructor(address[] memory _admins) AdminRole(_admins) internal {}

    event ContributorAdded(address wallet);
    event ContributorRemoved(address wallet);

    struct ContributorInfo {
        address wallet;
        uint256 allowed;
        bool active;
    }

    function registerContributors(address[] memory wallets, uint256[] memory allowed) public;

    function removeContributors(address[] memory wallets) public;

    function getAllowed(address wallet) public view returns (uint256 allowed);

    function isContributor(address wallet) public view returns (bool);
}

// File: localhost/contracts/Registry.sol

pragma solidity ^0.5.0;



contract Registry is RegistryAbstract {
    mapping(address => ContributorInfo) contributors;

    constructor(address[] memory _admins) public RegistryAbstract(_admins) {}

    function registerContributors(
        address[] memory wallets,
        uint256[] memory allowed
    ) public {
        return _registerContributors(wallets, allowed);
    }

    function _registerContributors(
        address[] memory wallets,
        uint256[] memory allowed
    ) internal {
        require(
            wallets.length == allowed.length,
            "wallets and allowed values need to be the same length"
        );
        for (uint256 i = 0; i < wallets.length; ++i) {
            require(wallets[i] != address(0), "address can not be address(0)");
            ContributorInfo memory newContributor = ContributorInfo(
                wallets[i],
                allowed[i],
                true
            );
            contributors[newContributor.wallet] = newContributor;
            emit ContributorAdded(newContributor.wallet);
        }
    }

    function removeContributors(address[] memory wallets) public onlyAdmin {
        _removeContributors(wallets);
    }

    function _removeContributors(address[] memory wallets) internal {
        for (uint256 i = 0; i < wallets.length; ++i) {
            require(wallets[i] != address(0), "address can not be address(0)");
            delete contributors[wallets[i]].wallet;
            delete contributors[wallets[i]].allowed;
            delete contributors[wallets[i]].active;
            delete contributors[wallets[i]];
            emit ContributorRemoved(wallets[i]);
        }
    }

    function getAllowed(address wallet) public view returns (uint256 allowed) {
        return contributors[wallet].allowed;
    }

    function isContributor(address wallet) public view returns (bool) {
        return contributors[wallet].active;
    }
}
