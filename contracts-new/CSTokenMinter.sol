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



/**
 * @title AdminRole
 * @dev Admins are responsible for assigning and removing contributors.
 */
contract AdminRole is Context, Ownable {
    using Roles for Roles.Role;

    event AdminAdded(address indexed account);
    event AdminRemoved(address indexed account);

    Roles.Role private _admins;

    /**
     * @dev Initialize contract with an list of admins.
     * Deployer address is an admin by default.
     * @param accounts An optional list of admin addresses.
     */
    constructor(address[] memory accounts) internal {
        // Add the deployer account as admin:
        _addAdmin(_msgSender());
        emit AdminAdded(_msgSender());

        // Add all accounts from the list of other admins:
        for (uint256 i = 0; i < accounts.length; ++i) {
            // We skip the deployer account to avoid deployment errors.
            if (accounts[i] != _msgSender()) {
                _addAdmin(accounts[i]);
                emit AdminAdded(accounts[i]);
            }
        }
    }

    modifier onlyAdmin() {
        require(
            isAdmin(_msgSender()),
            "AdminRole: caller does not have the Admin role"
        );
        _;
    }

    /**
     * @dev Check if address has the Admin role on the contract.
     * @param account The address being checked
     * @return True, if it has the Admin role
     */
    function isAdmin(address account) public view returns (bool) {
        return _admins.has(account);
    }

    /**
     * @dev Add the Admin role to an address. Can only be called by an Admin.
     * @param account The address to receive Admin role
     */
    function addAdmin(address account) public onlyAdmin {
        _addAdmin(account);
    }

    /**
     * @dev Remove the admin role from the caller. Can only be called by an Admin.
     */
    function renounceAdmin() public onlyAdmin {
        _removeAdmin(_msgSender());
    }

    /**
     * @dev Remove the admin role from an admin account. Can only be called by the Owner.
     * @param account The address t
     */
    function removeAdmin(address account) public onlyOwner {
        _removeAdmin(account);
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


interface IMintable {
    function mint(address _who, uint256 _value) external;
}









/**
 * @dev Library for managing
 * https://en.wikipedia.org/wiki/Set_(abstract_data_type)[sets] of primitive
 * types.
 *
 * Sets have the following properties:
 *
 * - Elements are added, removed, and checked for existence in constant time
 * (O(1)).
 * - Elements are enumerated in O(n). No guarantees are made on the ordering.
 *
 * As of v2.5.0, only `address` sets are supported.
 *
 * Include with `using EnumerableSet for EnumerableSet.AddressSet;`.
 *
 * _Available since v2.5.0._
 *
 * @author Alberto Cuesta Cañada
 */
library EnumerableSet {

    struct AddressSet {
        // Position of the value in the `values` array, plus 1 because index 0
        // means a value is not in the set.
        mapping (address => uint256) index;
        address[] values;
    }

    /**
     * @dev Add a value to a set. O(1).
     * Returns false if the value was already in the set.
     */
    function add(AddressSet storage set, address value)
    internal
    returns (bool)
    {
        if (!contains(set, value)){
            set.index[value] = set.values.push(value);
            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Removes a value from a set. O(1).
     * Returns false if the value was not present in the set.
     */
    function remove(AddressSet storage set, address value)
    internal
    returns (bool)
    {
        if (contains(set, value)){
            uint256 toDeleteIndex = set.index[value] - 1;
            uint256 lastIndex = set.values.length - 1;

            // If the element we're deleting is the last one, we can just remove it without doing a swap
            if (lastIndex != toDeleteIndex) {
                address lastValue = set.values[lastIndex];

                // Move the last value to the index where the deleted value is
                set.values[toDeleteIndex] = lastValue;
                // Update the index for the moved value
                set.index[lastValue] = toDeleteIndex + 1; // All indexes are 1-based
            }

            // Delete the index entry for the deleted value
            delete set.index[value];

            // Delete the old entry for the moved value
            set.values.pop();

            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Returns true if the value is in the set. O(1).
     */
    function contains(AddressSet storage set, address value)
    internal
    view
    returns (bool)
    {
        return set.index[value] != 0;
    }

    /**
     * @dev Returns an array with all values in the set. O(N).
     * Note that there are no guarantees on the ordering of values inside the
     * array, and it may change when more values are added or removed.

     * WARNING: This function may run out of gas on large sets: use {length} and
     * {get} instead in these cases.
     */
    function enumerate(AddressSet storage set)
    internal
    view
    returns (address[] memory)
    {
        address[] memory output = new address[](set.values.length);
        for (uint256 i; i < set.values.length; i++){
            output[i] = set.values[i];
        }
        return output;
    }

    /**
     * @dev Returns the number of elements on the set. O(1).
     */
    function length(AddressSet storage set)
    internal
    view
    returns (uint256)
    {
        return set.values.length;
    }

    /** @dev Returns the element stored at position `index` in the set. O(1).
     * Note that there are no guarantees on the ordering of values inside the
     * array, and it may change when more values are added or removed.
     *
     * Requirements:
     *
     * - `index` must be strictly less than {length}.
     */
    function get(AddressSet storage set, uint256 index)
    internal
    view
    returns (address)
    {
        return set.values[index];
    }
}


/// @title Registry tracks trusted contributors: accounts and their max trust.
// Max trust will determine the maximum amount of tokens the account can obtain.
/// @author Nelson Melina
contract Registry is AdminRole {
    using EnumerableSet for EnumerableSet.AddressSet;

    //
    // STORAGE:
    //

    // EnumerableSet of all trusted accounts:
    EnumerableSet.AddressSet internal accounts;

    // Mapping of account => contributor max trust:
    mapping(address => uint256) maxTrusts;

    //
    // EVENTS:
    //

    /// @dev Emit when a contributor has been added:
    event ContributorAdded(address adr);

    /// @dev Emit when a contributor has been removed:
    event ContributorRemoved(address adr);

    //
    // CONSTRUCTOR:
    //

    /// @dev Construct the Registry,
    /// @param _admins (address[]) List of admins for the Registry contract.
    constructor(address[] memory _admins) public AdminRole(_admins) {}

    //
    // EXTERNAL FUNCTIONS:
    //

    /// @notice Register a contributor and set a non-zero max trust.
    /// @dev Can only be called by Admin role.
    /// @param _adr (address) The address to register as contributor
    /// @param _maxTrust (uint256) The amount to set as max trust
    function registerContributor(address _adr, uint256 _maxTrust)
    external
    onlyAdmin
    {
        _register(_adr, _maxTrust);
    }

    /// @notice Remove an existing contributor.
    /// @dev Can only be called by Admin role.
    /// @param _adr (address) Address to remove
    function removeContributor(address _adr) external onlyAdmin {
        _remove(_adr);
    }

    /// @notice Register a list of contributors with max trust amounts.
    /// @dev Can only be called by Admin role.
    /// @param _cnt (uint256) Number of contributors to add
    /// @param _adrs (address[]) Addresses to register as contributors
    /// @param _trusts (uint256[]) Max trust values to set to each contributor (in order)
    function registerContributors(
        uint256 _cnt,
        address[] calldata _adrs,
        uint256[] calldata _trusts
    ) external onlyAdmin {
        require(_adrs.length == _cnt, "Invalid number of addresses");
        require(_trusts.length == _cnt, "Invalid number of trust values");

        for (uint256 i = 0; i < _cnt; i++) {
            _register(_adrs[i], _trusts[i]);
        }
    }

    /// @notice Return all registered contributor addresses.
    /// @return contributors (address[]) Adresses of all contributors
    function getContributors()
    external
    view
    returns (address[] memory contributors)
    {
        return EnumerableSet.enumerate(accounts);
    }

    /// @notice Return contributor information about all accounts in the Registry.
    /// @return contrubutors (address[]) Adresses of all contributors
    /// @return trusts (uint256[]) Max trust values for all contributors, in order.
    function getContributorInfo()
    external
    view
    returns (address[] memory contributors, uint256[] memory trusts)
    {
        contributors = EnumerableSet.enumerate(accounts);
        uint256 len = contributors.length;

        trusts = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            trusts[i] = maxTrusts[contributors[i]];
        }
        return (contributors, trusts);
    }

    /// @notice Return the max trust of an address, or 0 if the address is not a contributor.
    /// @param _adr (address) Address to check
    /// @return allowed (uint256) Max trust of the address, or 0 if not a contributor.
    function getMaxTrust(address _adr)
    external
    view
    returns (uint256 maxTrust)
    {
        return maxTrusts[_adr];
    }

    //
    // INTERNAL FUNCTIONS:
    //

    function _register(address _adr, uint256 _trust) internal {
        require(_adr != address(0), "Cannot register zero address");
        require(_trust != 0, "Cannot set a max trust of 0");

        require(
            EnumerableSet.add(accounts, _adr),
            "Contributor already registered"
        );
        maxTrusts[_adr] = _trust;

        emit ContributorAdded(_adr);
    }

    function _remove(address _adr) internal {
        require(_adr != address(0), "Cannot remove zero address");
        require(maxTrusts[_adr] != 0, "Address is not a contributor");

        EnumerableSet.remove(accounts, _adr);
        delete maxTrusts[_adr];

        emit ContributorRemoved(_adr);
    }
}





/**
 * @dev Interface of the ERC20 standard as defined in the EIP. Does not include
 * the optional functions; to access them see {ERC20Detailed}.
 */
interface IERC20 {
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);
}



/**
 * @dev Wrappers over Solidity's arithmetic operations with added overflow
 * checks.
 *
 * Arithmetic operations in Solidity wrap on overflow. This can easily result
 * in bugs, because programmers usually assume that an overflow raises an
 * error, which is the standard behavior in high level programming languages.
 * `SafeMath` restores this intuition by reverting the transaction when an
 * operation overflows.
 *
 * Using this library instead of the unchecked operations eliminates an entire
 * class of bugs, so it's recommended to use it always.
 */
library SafeMath {
    /**
     * @dev Returns the addition of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `+` operator.
     *
     * Requirements:
     * - Addition cannot overflow.
     */
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");

        return c;
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, reverting on
     * overflow (when the result is negative).
     *
     * Counterpart to Solidity's `-` operator.
     *
     * Requirements:
     * - Subtraction cannot overflow.
     */
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return sub(a, b, "SafeMath: subtraction overflow");
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, reverting with custom message on
     * overflow (when the result is negative).
     *
     * Counterpart to Solidity's `-` operator.
     *
     * Requirements:
     * - Subtraction cannot overflow.
     *
     * _Available since v2.4.0._
     */
    function sub(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b <= a, errorMessage);
        uint256 c = a - b;

        return c;
    }

    /**
     * @dev Returns the multiplication of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `*` operator.
     *
     * Requirements:
     * - Multiplication cannot overflow.
     */
    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        // Gas optimization: this is cheaper than requiring 'a' not being zero, but the
        // benefit is lost if 'b' is also tested.
        // See: https://github.com/OpenZeppelin/openzeppelin-contracts/pull/522
        if (a == 0) {
            return 0;
        }

        uint256 c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");

        return c;
    }

    /**
     * @dev Returns the integer division of two unsigned integers. Reverts on
     * division by zero. The result is rounded towards zero.
     *
     * Counterpart to Solidity's `/` operator. Note: this function uses a
     * `revert` opcode (which leaves remaining gas untouched) while Solidity
     * uses an invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     */
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        return div(a, b, "SafeMath: division by zero");
    }

    /**
     * @dev Returns the integer division of two unsigned integers. Reverts with custom message on
     * division by zero. The result is rounded towards zero.
     *
     * Counterpart to Solidity's `/` operator. Note: this function uses a
     * `revert` opcode (which leaves remaining gas untouched) while Solidity
     * uses an invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     *
     * _Available since v2.4.0._
     */
    function div(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        // Solidity only automatically asserts when dividing by 0
        require(b > 0, errorMessage);
        uint256 c = a / b;
        // assert(a == b * c + a % b); // There is no case in which this doesn't hold

        return c;
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
     * Reverts when dividing by zero.
     *
     * Counterpart to Solidity's `%` operator. This function uses a `revert`
     * opcode (which leaves remaining gas untouched) while Solidity uses an
     * invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     */
    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        return mod(a, b, "SafeMath: modulo by zero");
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
     * Reverts with custom message when dividing by zero.
     *
     * Counterpart to Solidity's `%` operator. This function uses a `revert`
     * opcode (which leaves remaining gas untouched) while Solidity uses an
     * invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     *
     * _Available since v2.4.0._
     */
    function mod(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b != 0, errorMessage);
        return a % b;
    }
}


contract Minter is AdminRole {
    using SafeMath for uint256;

    event Donate(
        address indexed sender,
        address indexed token,
        uint64 indexed receiverId,
        uint256 amount,
        uint256 receivedCSTK,
        bytes32 homeTx
    );

    event Mint(
        address indexed recepient,
        uint256 amount
    );

    uint256 private constant MAX_TRUST_DENOMINATOR = 10000000;

    Registry internal registry;
    IERC20 internal cstkToken;
    IMintable internal dao;

    address public authorizedKey;

    uint256 public numerator;
    uint256 public denominator;

    constructor(
        address[] memory _authorizedKeys,
        address _daoAddress,
        address _registryAddress,
        address _cstkTokenAddress
    ) public AdminRole(_authorizedKeys) {
        dao = IMintable(_daoAddress);
        registry = Registry(_registryAddress);
        cstkToken = IERC20(_cstkTokenAddress);
    }

    function setRatio(uint256 _numerator, uint256 _denominator)
    external
    onlyAdmin
    {
        numerator = _numerator;
        denominator = _denominator;
    }

    function mint(address recepient, uint256 toMint) external onlyAdmin {
        _mint(recepient, toMint);
        emit Mint(recepient,toMint);
    }

    function yolomint(address recepient, uint256 toMint) external {
        _mint(recepient, toMint);
        emit Mint(recepient,toMint);
    }

    function _mint(address recepient, uint256 toMint) internal {
        // Determine the maximum supply of the CSTK token.
        uint256 totalSupply = cstkToken.totalSupply();

        // Get the max trust amount for the recepient acc from the Registry.
        uint256 maxTrust = registry.getMaxTrust(recepient);

        // Get the current CSTK balance of the recepient account.
        uint256 recepientBalance = cstkToken.balanceOf(recepient);

        // The recepient cannot receive more than the following amount of tokens:
        // maxR := maxTrust[recepient] * TOTAL_SUPPLY / 10000000.
        uint256 maxToReceive = maxTrust.mul(totalSupply).div(
            MAX_TRUST_DENOMINATOR
        );

        // If the recepient is to receive more than this amount of tokens, reduce
        // mint the difference.
        if (maxToReceive <= recepientBalance.add(toMint)) {
            toMint = maxToReceive.sub(recepientBalance);
        }

        // If there is anything to mint, mint it to the recepient.
        if (toMint > 0) {
            dao.mint(recepient, toMint);
        }
    }

    function deposit(
        address sender,
        address token,
        uint64 receiverId,
        uint256 amount,
        bytes32 homeTx
    ) external onlyAdmin {
        require(denominator != 0, "denominator cannot be 0");

        // Get the amount to mint based on the numerator/denominator.
        uint256 toMint = amount.mul(numerator).div(denominator);

        _mint(sender, toMint);

        emit Donate(sender, token, receiverId, amount, toMint, homeTx);
    }
}



